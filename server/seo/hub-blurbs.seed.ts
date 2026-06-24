// Curated editorial blurbs for the highest-traffic BMW chassis and the
// main series hubs. Used to seed `hub_editorial` so that
// `/chassis/:code` and `/series/:slug` landing pages render
// human-written copy on top of the auto-generated intro built in
// `server/seo/content.ts`.
//
// The set covers the top 20+ chassis (G80, G87, F80, E46, E90, …) and
// the five main series hubs (M, 3, 5, 7, X). Run the companion script
// `tsx scripts/seed-hub-blurbs.ts` to upsert these into the database
// idempotently.

export type HubBlurb = {
  hubType: "chassis" | "series";
  hubKey: string;
  blurb: string;
};

export const CHASSIS_HUB_BLURBS: HubBlurb[] = [
  {
    hubType: "chassis",
    hubKey: "G80",
    blurb:
      "The G80 M3 (2021–present) is BMW's sixth-generation M3 sedan, built around the S58 3.0L twin-turbo inline-six producing 473 hp in the standard car and 503 hp in Competition trim. Common parts to plan for include carbon ceramic brake hardware, the optional carbon bucket seat consumables, charge-pipe and intercooler upgrades, the active-differential service kit, and the OPF/GPF assemblies on European-spec cars. The G80 shares its core S58 driveline with the G82 M4 and G87 M2 — many cooling, intake, drivetrain and brake part numbers cross over, so search by part number rather than chassis if you're sourcing wear items.",
  },
  {
    hubType: "chassis",
    hubKey: "G82",
    blurb:
      "The G82 M4 Coupe (2021–present) shares its S58 powertrain, suspension, brakes and most service parts with the G80 M3 sedan and the convertible G83. Buyers tend to focus on the carbon roof and active-aero parts, the carbon-ceramic brake kits, M Performance exhaust valves and tips, the CSL-spec brake ducts, and the front splitters that get scuffed quickly. When the OPF particulate filter, charge pipe or N20-style oil filter housing fails, the part numbers are typically the same as the G80 M3, so cross-reference to widen your supplier pool.",
  },
  {
    hubType: "chassis",
    hubKey: "G87",
    blurb:
      "The G87 M2 (2023–present) is the entry-level M-car built on a shortened G42 2 Series platform with the S58 inline-six (453–473 hp). Most maintenance items — oil filter housings, charge pipes, intercooler hardware, brake rotors and pads, active-diff fluid kits — share their part numbers with the G80 M3 and G82 M4. G87-specific parts to watch are the front splitter, rear diffuser, the carbon roof option, the carbon bucket seat hardware, and the chassis-specific subframe bushings. Early cars can develop charge-pipe and oil-cooler leaks worth diagnosing before any major service.",
  },
  {
    hubType: "chassis",
    hubKey: "F80",
    blurb:
      "The F80 M3 sedan (2014–2018) introduced BMW's S55 3.0L twin-turbo inline-six (425 hp) and shares its driveline with the F82 M4 coupe and F83 convertible. The S55 is famous for cracking factory charge pipes, leaking oil filter housing gaskets, failing crank hub keys, and rod bearings that benefit from a preventative refresh around 60–80k miles. Carbon-ceramic brake kits, the active diff service hardware, and the carbon roof are common upgrade and replacement items. Most F80/F82/F83 part numbers cross-reference exactly, so search by number when sourcing OEM parts.",
  },
  {
    hubType: "chassis",
    hubKey: "F82",
    blurb:
      "The F82 M4 coupe (2014–2020) carries the same S55 twin-turbo inline-six, ZF transmission options, active diff and carbon roof as the F80 M3 sedan. Plan for the well-known S55 weak points: charge pipes, oil filter housing gaskets, water pump and thermostat, crank hub, and rod bearing refresh. The chassis-specific items are mostly cosmetic — front splitter, side skirts, GTS-style spoiler — while drivetrain and cooling parts are interchangeable with the F80 sedan and F83 convertible. CSL-spec parts are valuable identifiers when shopping.",
  },
  {
    hubType: "chassis",
    hubKey: "F87",
    blurb:
      "The F87 M2 (2016–2018) and M2 Competition / CS (2018–2021) are the spiritual successor to the 1M Coupe. Original M2 cars use the N55 single-turbo inline-six, while the Competition and CS get the S55 twin-turbo unit shared with the F80 M3. Common service work on N55 cars includes the VANOS solenoids, water pump, charge pipe, and oil filter housing gasket; S55-engined Competition cars share most wear items with the F80/F82. The chassis-specific suspension, subframe, and cosmetic parts are unique to F87 — confirm fitment carefully when ordering.",
  },
  {
    hubType: "chassis",
    hubKey: "F90",
    blurb:
      "The F90 M5 (2018–2023) is BMW's first all-wheel-drive M5, powered by the 4.4L S63 twin-turbo V8 (600 hp standard, 617 hp Competition, 626 hp CS). Watch for transfer-case service intervals, M xDrive front driveshaft wear, brake rotor replacement (carbon-ceramic optional), and the V8's coolant transfer pipes and valve-cover gaskets. The CS variant adds carbon-fibre body parts, lighter wheels, and a unique exhaust. Many engine, cooling and suspension parts cross-reference with the contemporaneous F92 M8, so search by part number.",
  },
  {
    hubType: "chassis",
    hubKey: "E46",
    blurb:
      "The E46 (1999–2006) is the third-generation 3 Series and one of the most popular BMW chassis on the road. Common service points across the range: cooling system overhaul (radiator, expansion tank, water pump, thermostat, hoses) is a 60–80k-mile must on M52/M54 cars, rear subframe inspection on early sedans and all M3s, VANOS rebuild kits, window regulators, glove-box hinges and door-handle carriers. The E46 M3 (S54 inline-six) needs rod-bearing refresh attention; non-M cars share most chassis parts across coupe (E46/2), sedan (E46/4), touring (E46/3), convertible (E46/C) and Compact (E46/5).",
  },
  {
    hubType: "chassis",
    hubKey: "E90",
    blurb:
      "The E90 sedan (2005–2012) is the fourth-generation 3 Series and shares part numbers with the E91 touring, E92 coupe, and E93 convertible. N52 naturally-aspirated cars are reliable but commonly need valve-cover gaskets, oil filter housing gaskets and electric water pumps. N54 twin-turbo cars (335i) are known for fuel injectors, HPFP, wastegate rattle and charge-pipe failures; N55 successor cars are simpler but still wear out the VANOS and water pump. The E90 M3 uses the S65 V8 with its own throttle actuators, rod bearings and high-rev VANOS service items.",
  },
  {
    hubType: "chassis",
    hubKey: "E92",
    blurb:
      "The E92 coupe (2006–2013) is the two-door variant of the E90 family and shares almost all drivetrain, cooling and suspension parts with the sedan, touring (E91) and convertible (E93). N52, N54 and N55 inline-sixes plus the V8 S65 in the M3 cover most of the lineup. The E92 M3 is the only V8 M3 ever produced — plan for rod-bearing refresh, throttle-actuator replacement, S65 VANOS service, and the M-specific brake/suspension parts. Body and trim parts are E92-specific (frameless doors, coupe-only quarter panels, unique tail lamps).",
  },
  {
    hubType: "chassis",
    hubKey: "E36",
    blurb:
      "The E36 (1990–2000) is the second-generation 3 Series and the platform that put BMW's chassis tuning on the modern map. M42, M44 four-cylinder, M50/M52 inline-sixes and the legendary S50/S52/S54 M3 powerplants all share many ancillary parts. Plan for cooling overhauls (plastic radiator end-tanks crack, water pumps fail), rear subframe reinforcement on aggressively driven cars, window regulator and door-handle carriers, instrument cluster pixel repair, and a full set of bushings (control arm, rear trailing arm, subframe) for any car over 100k miles. Coupe, sedan, touring, convertible and Compact variants share most mechanical parts.",
  },
  {
    hubType: "chassis",
    hubKey: "E30",
    blurb:
      "The E30 (1982–1994) is the original modern 3 Series and a rising classic. Most maintenance is straightforward: cooling system (radiator, water pump, thermostat, fan clutch on six-cylinder cars), valve-cover gasket and oil pan gasket, fuel pump and fuel filter on the engine. Rust repair panels (rear arches, jacking points, trunk floor) are commonly needed. M10, M20, M40 and the legendary S14 (M3) engines all have well-supported parts catalogues. The E30 M3 has many unique bodywork, suspension and engine parts that do not cross-reference to non-M E30s.",
  },
  {
    hubType: "chassis",
    hubKey: "E39",
    blurb:
      "The E39 5 Series (1995–2003) is BMW's fourth-generation 5 Series sedan and touring. Cooling system overhaul (radiator, expansion tank, water pump, thermostat, fan clutch and hoses) is the single most important service item on M52/M54 cars and should be done preventatively around 80k miles. VANOS rattles, oil-filter housing gasket leaks, window regulators, pixel-fade instrument clusters, and front control-arm bushings are all common. The E39 M5 uses the S62 V8 with its own VANOS, throttle actuators and timing chain guides — plan for those at higher mileage.",
  },
  {
    hubType: "chassis",
    hubKey: "E60",
    blurb:
      "The E60 5 Series (2003–2010) introduced active steering, iDrive, and the divisive Bangle styling. N52, N54, M54, V8 N62, and diesel powerplants cover the range. Common service items: N62 V8 valve-stem seals (smoke on cold start) and alternator-bracket gasket leaks; N54 fuel injectors and HPFP; iDrive controllers and battery in the boot; rear suspension links and integral-link bushings. The E60 M5 uses the S85 V10 — a high-strung engine that needs rod-bearing refresh, throttle-actuator service and SMG pump care; it shares almost no service parts with non-M E60s.",
  },
  {
    hubType: "chassis",
    hubKey: "E34",
    blurb:
      "The E34 5 Series (1988–1996) is the third-generation 5 Series sedan and touring. M20, M30, M50, M60 V8 and the legendary E34 M5 (S38) powerplants cover the range. Plan for cooling-system overhaul, M20 timing belt service, M50/M60 cooling and oil-leak repairs, self-levelling rear suspension on touring models, and rust repair on rear arches. Trim and interior parts are increasingly hard to find — confirm part numbers and condition before ordering.",
  },
  {
    hubType: "chassis",
    hubKey: "E38",
    blurb:
      "The E38 7 Series (1994–2001) is the second-generation modern 7 Series and considered one of the best-looking BMW flagships. M60/M62 V8s and the M73 V12 are the primary engines; service items include nikasil-bore concerns on early M60 V8s, valve-stem seals on M62, timing-chain guides, and the famously expensive V12 work on M73 cars. Cooling-system overhauls, suspension bushings, and self-levelling rear shock parts are common. Body/interior trim parts are increasingly hard to find — confirm part numbers before assuming availability.",
  },
  {
    hubType: "chassis",
    hubKey: "E65",
    blurb:
      "The E65 7 Series (2001–2008) is the controversial Bangle-era flagship. The N62 V8 and N73 V12 are the headline engines along with the diesel M67. Plan for N62 valve-stem seals, alternator-bracket coolant leaks, and the Valvetronic eccentric shaft sensor; iDrive failures and air-suspension compressor and bag replacement are very common. The E66 long-wheelbase shares almost all mechanical parts with the E65. Many electronics are E65-specific and not interchangeable with later 7 Series.",
  },
  {
    hubType: "chassis",
    hubKey: "E70",
    blurb:
      "The E70 X5 (2007–2013) is BMW's second-generation X5 SUV. N52 inline-six, N54/N55 turbo six, N62 and N63 V8, M57 diesel and the V8-powered E70 X5 M cover the range. Common items: front control-arm and thrust-arm bushings, transfer-case service (often overlooked), air-suspension hardware on rear, N63 timing-chain guides and turbo coolant lines, and water-pump replacement on N52/N54/N55. The X5 M uses the S63 V8 with its own service intervals. The E71 X6 shares most mechanical parts with the E70.",
  },
  {
    hubType: "chassis",
    hubKey: "E83",
    blurb:
      "The E83 X3 (2004–2010) is BMW's first-generation X3, sharing its E46 platform underpinnings. M54 and N52 inline-sixes are the main petrol engines along with the M47/M57 diesels. Plan for transfer-case (xDrive) failure (the actuator motor and clutch pack are the usual culprit), front control-arm bushings, panoramic-roof drain cleaning and motor service, and rear differential bushings. Cooling and ignition parts often cross-reference back to the E46 3 Series.",
  },
  {
    hubType: "chassis",
    hubKey: "E82",
    blurb:
      "The E82 1 Series Coupe (2008–2013) and E88 convertible share their platform with the E90 3 Series. N52 inline-six, the legendary N54 twin-turbo 135i, and the later N55 are the petrol engines. Plan for N54-specific items (HPFP, fuel injectors, charge pipe, wastegate rattle), water-pump and thermostat replacement, oil-filter housing gasket, and the 1M Coupe's unique bodywork and brake parts. The 135i and 1M share most drivetrain parts with the E90/E92 335i — search by part number.",
  },
  {
    hubType: "chassis",
    hubKey: "E89",
    blurb:
      "The E89 Z4 roadster (2009–2016) replaced the E85/E86 with a folding hardtop. N20, N52, N54 and N55 inline-sixes power the range. Common service: N20 timing-chain (do it preventatively), N54 HPFP and injectors, water-pump replacement, hardtop hydraulics service (the hydraulic pump and lines fail on neglected cars), and convertible-top sensor calibration. The sDrive35is uses an overboosted N54 and shares most engine ancillaries with the E92 335is.",
  },
  {
    hubType: "chassis",
    hubKey: "F30",
    blurb:
      "The F30 3 Series (2012–2019) is the sixth-generation 3 Series sedan, with the F31 touring, F34 Gran Turismo, and F32/F33/F36 4 Series sharing most parts. N20 four-cylinder, N26, N52 holdover, N55 and B58 inline-sixes power the range, plus the diesel B47 and N47 in many markets. Plan for the well-known N20 timing-chain (and oil-filter housing gasket) issues, water-pump and thermostat replacement, electric power-steering rack faults, and the eDrive battery on the 330e. Most service parts are shared across all F30/F31/F32/F34/F36 variants.",
  },
  {
    hubType: "chassis",
    hubKey: "F32",
    blurb:
      "The F32 4 Series Coupe (2013–2020) and the F33 convertible / F36 Gran Coupe share most parts with the F30/F31 3 Series. N20 four-cylinder, N26, N55 and B58 inline-sixes cover the range along with B47 diesels in Europe. Common service items: N20 timing-chain (do it preventatively under 80k miles), oil-filter housing gasket, water-pump and thermostat, charge-pipe failures on N55 and B58, and electric power-steering rack faults. Most service parts are interchangeable with the F30/F31 of the same year.",
  },
  {
    hubType: "chassis",
    hubKey: "F10",
    blurb:
      "The F10 5 Series (2010–2017) is the sixth-generation 5 Series, with F11 touring and F07 5 GT siblings. N20, N52, N55, N63 V8 and the M5's S63 V8 cover the petrol range; N47/N57 diesels are common in Europe. N63 V8 cars need preventative attention to timing-chain guides, valve-stem seals, vacuum pumps and the famously expensive turbocharger hot-side. The F10 M5 (S63B44) shares many service parts with the F90 M5 and F12 M6 — search by part number. Air-suspension is rear-only on most variants.",
  },
  {
    hubType: "chassis",
    hubKey: "F15",
    blurb:
      "The F15 X5 (2014–2018) is the third-generation X5 SUV. N55 inline-six, N20 four-cylinder, N63 V8 (50i and X5 M's S63), N57 diesel cover the range. Plan for N63 timing-chain and turbo coolant-line service, valve-stem seals, transfer-case fluid changes, panoramic-roof drain cleaning, and air-suspension components on rear-air-equipped cars. Many ancillary parts cross-reference with the F16 X6 and F10 5 Series of the same period.",
  },
  {
    hubType: "chassis",
    hubKey: "G20",
    blurb:
      "The G20 3 Series (2019–present) is the seventh-generation 3 Series sedan, with G21 touring sharing most parts. B48 four-cylinder and B58 inline-six are the headline engines along with B47 diesels and the 330e/M340e plug-in hybrid drivetrain. Common service items so far: oil-filter housing gasket on B48/B58, valve-cover gasket, charge-pipe inspection on tuned cars, and the GPF/OPF on European cars. The M340i shares its B58 ancillaries with the G05 X5 40i, G29 Z4 M40i, Toyota Supra and many other B58 applications — cross-reference part numbers freely.",
  },
  {
    hubType: "chassis",
    hubKey: "G30",
    blurb:
      "The G30 5 Series (2017–2023) is the seventh-generation 5 Series, with the G31 touring sharing most parts. B48, B58, N63 V8, S63 (M550i and F90 M5 derivatives) and B47/B57 diesels cover the range. Watch for N63 V8 timing-chain and valve-stem seal service on 540i/M550i cars, rear air-suspension hardware on equipped cars, and the integrated-active-steering hardware on cars optioned with it. Most B48/B58 ancillaries cross-reference with G20 3 Series and G05 X5 of the same era.",
  },
  {
    hubType: "chassis",
    hubKey: "G05",
    blurb:
      "The G05 X5 (2019–present) is the fourth-generation X5 SUV. B58 inline-six (40i), N63 V8 (50i, M50i), S63 V8 (X5 M F95), B57 diesel and the X5 45e plug-in hybrid drivetrain power the range. Plan for air-suspension compressor and bag service, rear-wheel-steering service on so-equipped cars, transfer-case fluid changes, and the usual N63 V8 preventative items (timing chain, valve-stem seals, vacuum pump). Most B58 service parts cross-reference with the G20 M340i, G30 540i, G29 Z4 M40i and Toyota Supra.",
  },
  // ---------------------------------------------------------------------
  // Mid-traffic chassis (Task #41). Covers the long tail beyond the top
  // 28 chassis above with the same buying-guide / common-parts / cross-
  // reference framing.
  // ---------------------------------------------------------------------
  {
    hubType: "chassis",
    hubKey: "E28",
    blurb:
      "The E28 5 Series (1981–1988) is the second-generation 5 Series and the chassis that introduced the M5 (E28 M5, S38 inline-six). M10 four-cylinders, the M20 'small six', the M30 'big six' and the diesel M21 cover the engine range. Plan for cooling-system overhaul (radiator, water pump, thermostat, fan clutch), Motronic and L-Jetronic fuel-system service, M30 timing-chain guide replacement, and a full bushing refresh on cars over 100k miles. Rust repair on rear arches, jacking points and the battery tray is common. Body and interior trim parts are increasingly hard to find — confirm part numbers before assuming availability.",
  },
  {
    hubType: "chassis",
    hubKey: "E32",
    blurb:
      "The E32 7 Series (1986–1994) is the first modern 7 Series and the chassis that introduced the M70 V12 alongside the M30 inline-six and the M60 V8. Plan for cooling-system overhaul on every variant, M30 timing-chain guides, M60 nikasil-bore concerns on early V8 cars (check compression before buying), and the famously expensive V12 service items (twin distributors, dual ignition coils, dual throttle bodies). Self-levelling rear suspension and the early electronic damper controllers commonly fail. Many trim and electronics parts are E32-specific and do not cross to the E34 5 Series.",
  },
  {
    hubType: "chassis",
    hubKey: "E53",
    blurb:
      "The E53 X5 (1999–2006) is BMW's first SAV and shares many drivetrain parts with the contemporaneous E39 5 Series and E38 7 Series. M54 inline-six, M62 and N62 V8, and the M57 diesel cover the range, plus the rare X5 4.8is. Plan for transfer-case service (the actuator motor and clutch pack are the usual culprit), front control-arm and thrust-arm bushings, panoramic-roof drain cleaning, rear self-levelling suspension hardware on equipped cars, M62 valve-stem seals and timing-chain guides, and N62 alternator-bracket coolant leaks. The 4.8is uses a higher-output N62 with its own intake and exhaust hardware.",
  },
  {
    hubType: "chassis",
    hubKey: "E63",
    blurb:
      "The E63 6 Series Coupe (2003–2010) and E64 convertible share their platform with the E60 5 Series. N62 V8, N52 inline-six and the S85 V10 in the E63 M6 cover the range. Plan for N62 valve-stem seals (smoke on cold start), alternator-bracket gasket leaks, and Valvetronic eccentric shaft sensor failures; the M6 needs S85 rod-bearing refresh, throttle-actuator service and SMG pump care. Soft-top hydraulics on the E64 convertible and the folding metal hardware are common service items. Most non-M E63/E64 service parts cross-reference with the E60 5 Series of the same year.",
  },
  {
    hubType: "chassis",
    hubKey: "E64",
    blurb:
      "The E64 6 Series Convertible (2003–2010) is the soft-top sibling of the E63 coupe and shares almost all drivetrain, cooling and suspension parts with it and with the E60 5 Series. N62 V8 and N52 inline-six are the volume engines, while the E64 M6 carries the S85 V10. Plan for the N62 weak points (valve-stem seals, alternator-bracket coolant leaks, Valvetronic eccentric-shaft sensor) and the convertible-specific items: soft-top motor and hydraulic pump, top-frame microswitches, and rear-window defroster wiring. M6 service items overlap with the E60 M5.",
  },
  {
    hubType: "chassis",
    hubKey: "E71",
    blurb:
      "The E71 X6 (2008–2014) is BMW's original 'Sports Activity Coupe' and shares its platform with the E70 X5. N55 inline-six, N63 V8 (xDrive50i), S63 V8 (X6 M) and M57 diesel cover the range. Plan for N63 timing-chain and turbo coolant-line service on 50i cars, valve-stem seals, transfer-case fluid changes, and the air-suspension components on the rear. The X6 M uses the S63 V8 with carbon-ceramic brake options and its own active-roll bars and rear-diff hardware. Most non-M E71 service parts cross-reference with the E70 X5 — search by part number to widen supplier choice.",
  },
  {
    hubType: "chassis",
    hubKey: "E84",
    blurb:
      "The E84 X1 (2009–2015) is the first-generation X1, built on the E90 3 Series rear-drive platform. N20 four-cylinder, N52 inline-six and the N47/N57 diesels cover the range. Plan for the well-known N20 timing-chain replacement (do it preventatively under 80k miles), oil-filter housing gasket, water-pump and thermostat, transfer-case actuator motor and clutch pack on xDrive cars, and front control-arm bushings. Many cooling and ignition parts cross-reference back to the E90 3 Series of the same year.",
  },
  {
    hubType: "chassis",
    hubKey: "E85",
    blurb:
      "The E85 Z4 Roadster (2002–2008) and E86 Coupe replaced the Z3 with a sharper-edged design. M54 and N52 inline-sixes power most cars, while the Z4 M (E85/E86) carries the high-revving S54 inline-six shared with the E46 M3. Plan for cooling-system overhaul on M54/N52 cars, electric power-steering motor faults (the famous EPS failure — check the connector for water ingress first), convertible-top hydraulic pump and microswitch service, and on Z4 M cars the S54 rod-bearing refresh and VANOS rebuild. E86 coupe-specific glass and trim are increasingly hard to source.",
  },
  {
    hubType: "chassis",
    hubKey: "E86",
    blurb:
      "The E86 Z4 Coupe (2006–2008) is the rare hardtop sibling of the E85 roadster and shares almost all drivetrain, suspension and brake parts with it. N52 inline-six and the S54-powered Z4 M Coupe cover the range. Plan for the same wear items as the E85: cooling overhaul on N52, electric power-steering motor faults, and on Z4 M cars the S54 rod-bearing refresh and VANOS rebuild. Coupe-specific bodywork (rear hatch, quarter glass, hatch struts) is unique to the E86 and not interchangeable with the E85 roadster.",
  },
  {
    hubType: "chassis",
    hubKey: "E91",
    blurb:
      "The E91 3 Series Touring (2005–2012) is the wagon variant of the E90 sedan and shares almost all drivetrain, cooling and suspension parts with the E90, E92 coupe and E93 convertible. N52 naturally-aspirated, N53, N54 twin-turbo and N55 inline-sixes cover the petrol range along with the N47/M47 diesels. Plan for cooling-system parts (water pump, thermostat, expansion tank), N54-specific items (HPFP, fuel injectors, charge pipe, wastegate rattle), tailgate-strut wear and rear self-levelling suspension on equipped models. Touring-specific tailgate, rear bumper and quarter-glass parts are unique to the E91.",
  },
  {
    hubType: "chassis",
    hubKey: "E93",
    blurb:
      "The E93 3 Series Convertible (2007–2013) is the folding-hardtop variant of the E90 family and shares its drivetrain and suspension with the E90 sedan, E91 touring and E92 coupe. N52, N54, N55 inline-sixes and the V8 S65 in the E93 M3 cover the range. Plan for the standard E9x cooling and oil-leak items, plus the convertible-specific roof hardware: hydraulic pump, hydraulic cylinders, top-frame microswitches and the trunk-divider mechanism. M3 cabriolets carry the same S65-specific service items (rod bearings, throttle actuators, VANOS) as the E92 M3.",
  },
  {
    hubType: "chassis",
    hubKey: "F01",
    blurb:
      "The F01 7 Series (2008–2015) is the fifth-generation modern 7 Series and the long-wheelbase F02 shares almost all mechanical parts with it. N55 inline-six, N63 V8 (740i/750i), S63 (Alpina B7 and short-run M-tuned variants) and the N74 V12 (760i) cover the range. Plan for N63 timing-chain and turbo coolant-line service, valve-stem seals, vacuum-pump leaks, and the famously expensive N74 V12 work. Air-suspension compressor and bag replacement, rear self-levelling, and Valvetronic eccentric-shaft sensor failures are common. Many electronics are F01-specific and not interchangeable with the G11.",
  },
  {
    hubType: "chassis",
    hubKey: "F06",
    blurb:
      "The F06 6 Series Gran Coupe (2012–2018) is the four-door fastback variant of the F12 convertible and F13 coupe, sharing their platform with the F10 5 Series. N55 inline-six, N63 V8 (650i) and the S63 V8 in the F06 M6 Gran Coupe cover the range. Plan for N63 timing-chain and valve-stem seal service on 650i cars, water-pump and thermostat replacement on N55, and on M6 cars the S63 service items shared with the F10 M5 and F13 M6. Most chassis, suspension and brake parts cross-reference with the F12/F13 of the same year.",
  },
  {
    hubType: "chassis",
    hubKey: "F12",
    blurb:
      "The F12 6 Series Convertible (2011–2018) and the F13 coupe share their platform with the F10 5 Series and the F06 Gran Coupe. N55 inline-six, N63 V8 (650i) and the S63 V8 in the F12 M6 cover the range. Plan for the standard N63 weak points (timing chain, valve-stem seals, turbo coolant lines), the convertible-specific soft-top hardware (hydraulic pump, microswitches, top-frame service), and on M6 cars the S63 carbon-ceramic brake hardware and active-diff service. Most non-roof parts cross-reference with the F13 coupe and the F10 5 Series.",
  },
  {
    hubType: "chassis",
    hubKey: "F22",
    blurb:
      "The F22 2 Series Coupe (2014–2021) and the F23 convertible share their platform with the F30 3 Series and use most of the same drivetrain, cooling and suspension parts. N20 four-cylinder, N26, N55 and B58 inline-sixes cover the petrol range, plus the M2 (F87) which sits on top with its own catalogue. Plan for the well-known N20 timing-chain replacement, oil-filter housing gasket, water-pump and thermostat, and charge-pipe inspection on N55/B58 cars. M240i (B58) ancillaries cross-reference with the G20 M340i and Toyota Supra.",
  },
  {
    hubType: "chassis",
    hubKey: "F25",
    blurb:
      "The F25 X3 (2010–2017) is the second-generation X3, built on the F30 3 Series platform. N20 four-cylinder, N52 holdover inline-six, N55 turbo six and the N47/N57 diesels cover the range. Plan for the N20 timing-chain replacement (do it preventatively under 80k miles), oil-filter housing gasket, transfer-case actuator and clutch pack on xDrive cars, panoramic-roof drain cleaning, and rear-shock mounts. Most service parts cross-reference with the F30/F31 3 Series of the same year.",
  },
  {
    hubType: "chassis",
    hubKey: "F26",
    blurb:
      "The F26 X4 (2014–2018) is the first-generation X4 and the coupe-styled sibling of the F25 X3, with which it shares almost all drivetrain, cooling and suspension parts. N20 four-cylinder, N55 inline-six and the N57 diesels cover the range. Plan for the N20 timing-chain service, oil-filter housing gasket, water-pump and thermostat replacement, transfer-case actuator and clutch pack, and panoramic-roof drain cleaning. F26-specific items are mostly cosmetic (rear hatch, quarter panels, rear bumper, unique tail lamps) — confirm by part number before ordering body parts.",
  },
  {
    hubType: "chassis",
    hubKey: "F31",
    blurb:
      "The F31 3 Series Touring (2012–2019) is the wagon variant of the F30 sedan and shares almost all drivetrain, cooling, suspension and interior parts with the F30, F34 Gran Turismo, and F32/F33/F36 4 Series. N20 four-cylinder, N26, N55 and B58 inline-sixes plus the B47/N47 diesels cover the range. Plan for the well-known N20 timing-chain (and oil-filter housing gasket) issues, water-pump and thermostat replacement, electric power-steering rack faults, and tailgate-strut wear. Touring-specific tailgate, rear-bumper and rear-quarter-glass parts are unique to the F31.",
  },
  {
    hubType: "chassis",
    hubKey: "F33",
    blurb:
      "The F33 4 Series Convertible (2014–2020) is the folding-hardtop variant of the F32 coupe and shares almost all drivetrain and suspension parts with it and with the F30/F31 3 Series. N20 four-cylinder, N26, N55 and B58 inline-sixes power the range, plus the F83 M4 with its S55 twin-turbo six. Plan for the standard F30 family wear items (N20 timing chain, oil-filter housing gasket, water pump, thermostat) and the convertible-specific roof hardware: hydraulic pump, hydraulic cylinders, top-frame microswitches, and the rear-window defroster.",
  },
  {
    hubType: "chassis",
    hubKey: "F34",
    blurb:
      "The F34 3 Series Gran Turismo (2013–2020) is the fastback variant of the F30 sedan with a longer wheelbase and a power tailgate. It shares most drivetrain, cooling, suspension and interior parts with the F30/F31 of the same year. N20 four-cylinder, N26, N55 and B58 inline-sixes plus the B47/N47 diesels cover the range. Plan for N20 timing-chain replacement, oil-filter housing gasket, water-pump and thermostat replacement, and the GT-specific power-tailgate motor and struts. Body and rear-end parts are F34-specific and do not cross to the F30 sedan.",
  },
  {
    hubType: "chassis",
    hubKey: "F36",
    blurb:
      "The F36 4 Series Gran Coupe (2014–2020) is the four-door fastback variant of the F32 coupe and shares almost all drivetrain, cooling and suspension parts with the F30/F31 3 Series and F32/F33 4 Series. N20 four-cylinder, N26, N55 and B58 inline-sixes plus the B47/N47 diesels cover the range. Plan for the well-known F30 family wear items (N20 timing chain, oil-filter housing gasket, water pump, thermostat) and the F36-specific power-tailgate hardware. Front bodywork is shared with the F32; rear bodywork and the four-door roofline are unique to the F36.",
  },
  {
    hubType: "chassis",
    hubKey: "F45",
    blurb:
      "The F45 2 Series Active Tourer (2014–2021) is BMW's first front-wheel-drive passenger car and the basis for the longer F46 2 Series Gran Tourer. B38 three-cylinder, B48 four-cylinder and the B37/B47 diesels cover the range, plus the 225xe plug-in hybrid drivetrain. Plan for the early-production B38/B48 timing-chain stretch (BMW issued an extended warranty), oil-filter housing gasket, electric water pump, and the FWD-specific front lower control-arm bushings. Service parts mostly cross-reference with other UKL-platform BMWs (F48 X1, F39 X2, MINI F-series, F52 1 Series sedan).",
  },
  {
    hubType: "chassis",
    hubKey: "F48",
    blurb:
      "The F48 X1 (2015–2022) is the second-generation X1 and the first to use BMW's UKL front-wheel-drive platform. B38 three-cylinder, B48 four-cylinder and the B37/B47 diesels cover the range, plus the 25e plug-in hybrid drivetrain. Plan for the B38/B48 timing-chain stretch (extended warranty applied to many cars), oil-filter housing gasket, electric water pump, transfer-case service on xDrive cars, and front lower control-arm bushings. Most service parts cross-reference with the F45/F46 2 Series Active/Gran Tourer, F39 X2, F52 1 Series sedan, and contemporaneous MINI F-series.",
  },
  {
    hubType: "chassis",
    hubKey: "F56",
    blurb:
      "The F56 MINI Hatch (2014–2024) is the third-generation modern MINI and shares its UKL platform with the BMW F48 X1, F45/F46 2 Series Active/Gran Tourer and F52 1 Series sedan. B38 three-cylinder (Cooper), B48 four-cylinder (Cooper S) and the B48TU (JCW) cover the petrol range. Plan for the early-production timing-chain stretch (BMW/MINI extended warranty applied to many cars), oil-filter housing gasket, electric water pump, charge-pipe failures on Cooper S/JCW cars, and the well-known clutch-slave-cylinder failures on manual cars. Many service parts cross-reference with the equivalent F48 X1.",
  },
  {
    hubType: "chassis",
    hubKey: "F97",
    blurb:
      "The F97 X3 M (2019–present) is the M-division X3 and shares its S58 3.0L twin-turbo inline-six (473–510 hp) with the F98 X4 M, the G80 M3 and the G82 M4. Most drivetrain, cooling and brake service items cross-reference exactly with the F98 X4 M and broadly with the G80/G82, so search by part number when sourcing OEM parts. F97-specific items include the SUV-only subframe bushings, the M-tuned air-suspension hardware on rear, brake-rotor sizing, and the Competition-spec front splitter and rear diffuser. Carbon-ceramic brakes are an option worth confirming before ordering.",
  },
  {
    hubType: "chassis",
    hubKey: "F98",
    blurb:
      "The F98 X4 M (2019–present) is the coupe-styled sibling of the F97 X3 M and shares its S58 3.0L twin-turbo inline-six, ZF 8-speed, M xDrive transfer case and active diff with the F97 and broadly with the G80 M3 and G82 M4. Plan for the same S58 service items as the rest of the family: oil-filter housing gasket, charge-pipe inspection on tuned cars, intercooler hardware, brake rotors and pads, and active-diff fluid kits. F98-specific items are mostly cosmetic (rear hatch, quarter panels, unique tail lamps) plus the coupe-only rear glass.",
  },
  {
    hubType: "chassis",
    hubKey: "G02",
    blurb:
      "The G02 X4 (2018–present) is the second-generation X4 and the coupe-styled sibling of the G01 X3, with which it shares almost all drivetrain, cooling and suspension parts. B48 four-cylinder, B58 inline-six, B47 diesel and the M40i performance variant cover the range; the X4 M (F98) sits on top with its own S58 catalogue. Plan for oil-filter housing gasket on B48/B58, charge-pipe inspection on tuned cars, transfer-case service, panoramic-roof drain cleaning, and rear shock-mount wear. Body and rear-end parts are G02-specific.",
  },
  {
    hubType: "chassis",
    hubKey: "G06",
    blurb:
      "The G06 X6 (2019–present) is the third-generation X6 and shares its platform with the G05 X5 and G07 X7. B58 inline-six (40i), N63 V8 (50i, M50i), S63 V8 (X6 M F96), B57 diesel and the X6 45e plug-in hybrid drivetrain cover the range. Plan for air-suspension compressor and bag service, transfer-case fluid changes, the standard N63 V8 preventative items (timing chain, valve-stem seals, turbo coolant lines), and rear-wheel-steering service on equipped cars. Most non-body service parts cross-reference with the G05 X5 of the same year.",
  },
  {
    hubType: "chassis",
    hubKey: "G07",
    blurb:
      "The G07 X7 (2019–present) is BMW's full-size three-row SUV and shares its platform with the G05 X5 and G06 X6. B58 inline-six (40i), N63 V8 (xDrive50i / M50i / Alpina XB7) and the B57 diesel cover the range. Plan for air-suspension compressor and bag service (a standard fitment, not optional), rear-wheel-steering service on equipped cars, transfer-case fluid changes, the third-row power-folding motor and rails, and the usual N63 V8 preventative items (timing chain, valve-stem seals, vacuum pump). Most B58 ancillaries cross-reference with the G20 M340i and G05 X5 40i.",
  },
  {
    hubType: "chassis",
    hubKey: "G14",
    blurb:
      "The G14 8 Series Convertible (2019–present), the G15 coupe and the G16 Gran Coupe are BMW's modern 8 Series, sharing their platform with the G05 X5 and G30 5 Series. B58 inline-six (840i), N63 V8 (M850i) and the S63 V8 in the M8 (F91/F92/F93) cover the range. Plan for the standard N63 weak points on M850i cars, the convertible-specific soft-top hardware on the G14 (hydraulic pump, microswitches, top-frame service), carbon-ceramic brake hardware on M cars, and active-diff fluid kits on M-equipped chassis. Most non-roof parts cross-reference with the G15 coupe and G16 Gran Coupe.",
  },
  {
    hubType: "chassis",
    hubKey: "G29",
    blurb:
      "The G29 Z4 Roadster (2019–present) is the third-generation Z4 and is built on a shared platform with the Toyota GR Supra (J29). B48 four-cylinder (sDrive20i/30i) and B58 inline-six (M40i) power the range. Plan for the well-known B48/B58 oil-filter housing gasket, electric water pump, charge-pipe inspection on tuned cars, and the soft-top hydraulic pump and microswitch service. Many M40i (B58) ancillaries cross-reference with the G20 M340i, G05 X5 40i and Toyota Supra — search by part number to widen your supplier pool.",
  },
  {
    hubType: "chassis",
    hubKey: "G42",
    blurb:
      "The G42 2 Series Coupe (2021–present) is the second-generation rear-drive 2 Series and the platform on which the G87 M2 is built. B48 four-cylinder (220i/230i) and B58 inline-six (M240i) cover the petrol range. Plan for the standard B48/B58 wear items (oil-filter housing gasket, electric water pump, charge-pipe inspection on tuned cars), brake-rotor and pad replacement, and active-diff service on M240i and M2. Most service parts cross-reference with the G20 3 Series and G05 X5 40i; M2-specific S58 items overlap with the G80 M3 and G82 M4 catalogues.",
  },
  {
    hubType: "chassis",
    hubKey: "G70",
    blurb:
      "The G70 7 Series (2022–present) is the seventh-generation 7 Series and the first to share its platform with a fully-electric sibling, the i7. B58 inline-six and N63 V8 are the petrol options on the 740i and 760i (with the M Performance M760e plug-in hybrid in some markets); the i7 uses dual-motor electric drivetrains. Plan for air-suspension compressor and bag service, rear-wheel-steering service, the theatre-screen rear-entertainment hardware, the executive-lounge seating modules, and the touch-control door panels. Many comfort and electronics parts are G70-specific and not interchangeable with the F01/G11 7 Series.",
  },
];

export const SERIES_HUB_BLURBS: HubBlurb[] = [
  {
    hubType: "series",
    hubKey: "m",
    blurb:
      "BMW M is the high-performance division of BMW, founded in 1972 as BMW Motorsport GmbH. The lineup spans the entry-level M2 (G87) through the M3 sedan (G80), M4 coupe and convertible (G82/G83), the all-wheel-drive M5 sedan (F90/G90) and M5 Touring, the X3 M and X4 M (F97/F98), the X5 M and X6 M (F95/F96), the M8 coupe, convertible and Gran Coupe (F91/F92/F93), and the new XM PHEV. Most modern M cars use either the S58 inline-six (M2/M3/M4) or the S63 twin-turbo V8 (M5/M8/X5 M/X6 M/XM). Common service points: carbon-ceramic brake hardware, M-specific cooling and oil systems, active differential fluid kits, the M Drift Analyser hardware, and OPF/GPF assemblies on European-spec cars. Heritage M cars (E30 M3, E36/E46/E92/F80/G80 M3, E28/E34/E39/E60 M5, F87 M2, 1M Coupe) all have dedicated parts ecosystems with limited cross-compatibility — always confirm by exact chassis code.",
  },
  {
    hubType: "series",
    hubKey: "3-series",
    blurb:
      "The BMW 3 Series is the most successful BMW model line ever made, in continuous production since 1975 and now in its seventh generation (G20/G21). The current G20 sedan and G21 touring share part numbers with the G22/G23/G26 4 Series, while previous generations include the F30/F31/F34 (2012–2019), E90/E91/E92/E93 (2005–2013), E46 (1999–2006), E36 (1990–2000), and the original E30 (1982–1994). Most-searched service items across the 3 Series catalogue: cooling-system parts (radiators, water pumps, thermostats, expansion tanks), oil-filter housing gaskets, valve-cover gaskets, brake pads and rotors, control-arm and thrust-arm bushings, and a long tail of trim and interior parts. The 3 Series is also the home of the storied M3 — a separate sub-line (E30 / E36 / E46 / E90 / F80 / G80) with mostly chassis-specific drivetrain parts.",
  },
  {
    hubType: "series",
    hubKey: "5-series",
    blurb:
      "The BMW 5 Series has been BMW's executive-class sedan and touring since 1972, currently in its eighth generation (G60/G61). Generations on the road include the G30/G31 (2017–2023), F10/F11/F07 (2010–2017), E60/E61 (2003–2010), E39/E39 Touring (1995–2003), E34 (1988–1996), and the early E28 and E12. Most common service items: cooling system on M52/M54/N52/N55/B58 cars, N63 V8 preventative work on 540i/550i/M550i, rear air-suspension hardware on equipped cars, ZF transmission service, integral-link bushings, and the iDrive controller and battery in the boot. The M5 (E28/E34/E39/E60/F10/F90/G90) is a separate sub-line — mostly its own engine, transmission and brake parts that don't cross with non-M 5s.",
  },
  {
    hubType: "series",
    hubKey: "7-series",
    blurb:
      "The BMW 7 Series is BMW's flagship luxury sedan, in continuous production since 1977 and currently in its seventh generation (G70). Generations include the G70 (2022–present), G11/G12 (2015–2022), F01/F02 (2008–2015), E65/E66 (2001–2008), E38 (1994–2001), E32 (1986–1994), and the original E23. Common service themes: large V8 (M62, N62, N63, N74 V12) preventative work, valve-stem seals, timing-chain service and turbo hot-side; air-suspension compressor and bag replacement; iDrive electronics; and the Valvetronic eccentric shaft sensor. Many trim, interior and body parts are flagship-only and have limited interchange with 5 or 6 Series — search by exact part number.",
  },
  {
    hubType: "series",
    hubKey: "x",
    blurb:
      "The BMW X line is BMW's range of SUVs and SAVs, spanning the X1 (subcompact), X2, X3, X4, X5, X6, X7 (full-size), and the iX electric SUV. Current generations include the U11 X1, U10 X2, G45 X3, G02/G26 X4, G05 X5, G06 X6, and G07 X7. Most-searched parts across the X catalogue: front control-arm and thrust-arm bushings (every X chassis is hard on these), panoramic-roof drain cleaning kits and motors, transfer-case fluid (commonly overlooked), air-suspension components on rear-air-equipped cars, and the N63 V8 timing-chain and valve-stem seal service items on equipped models. The X3 M and X4 M (F97/F98) and X5 M and X6 M (F95/F96/E70 X5M/E71 X6M) are the M division SUVs with their own dedicated parts catalogue.",
  },
];

export const ALL_HUB_BLURBS: HubBlurb[] = [
  ...CHASSIS_HUB_BLURBS,
  ...SERIES_HUB_BLURBS,
];
