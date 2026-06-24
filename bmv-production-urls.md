# BMV Production URL Reference
> Generated 2026-06-17. Use for full E2E testing across both domains.  
> `[auth]` = requires login. `[example]` = one real URL from many possible.

---

## bmv.parts

### Core / Static pages

| URL | Page |
|-----|------|
| https://www.bmv.parts/ | Home (Dashboard) |
| https://www.bmv.parts/search | Search Parts |
| https://www.bmv.parts/part-finder | AI Part Finder |
| https://www.bmv.parts/vin | VIN Decoder |
| https://www.bmv.parts/servicing | Servicing |
| https://www.bmv.parts/models | BMW Models index |
| https://www.bmv.parts/my-cars | My Cars `[auth]` |
| https://www.bmv.parts/about | About |
| https://www.bmv.parts/recommended-sites | Recommended Sites |
| https://www.bmv.parts/quote | Photo Quote |
| https://www.bmv.parts/api-docs | API Docs |
| https://www.bmv.parts/login | Login |
| https://www.bmv.parts/reset-password | Reset Password |
| https://www.bmv.parts/admin | Admin panel `[auth]` |
| https://www.bmv.parts/admin/realoem-backfill | RealOEM backfill `[auth]` |

---

### Series landing pages

| URL |
|-----|
| https://www.bmv.parts/series/1 |
| https://www.bmv.parts/series/2 |
| https://www.bmv.parts/series/3 |
| https://www.bmv.parts/series/4 |
| https://www.bmv.parts/series/5 |
| https://www.bmv.parts/series/6 |
| https://www.bmv.parts/series/7 |
| https://www.bmv.parts/series/M |
| https://www.bmv.parts/series/X1 |
| https://www.bmv.parts/series/X2 |
| https://www.bmv.parts/series/X3 |
| https://www.bmv.parts/series/X4 |
| https://www.bmv.parts/series/X5 |
| https://www.bmv.parts/series/X6 |
| https://www.bmv.parts/series/X7 |
| https://www.bmv.parts/series/XM |

---

### Chassis landing pages (`/chassis/:chassisCode`)

| URL |
|-----|
| https://www.bmv.parts/chassis/E30 |
| https://www.bmv.parts/chassis/E36 |
| https://www.bmv.parts/chassis/E46 |
| https://www.bmv.parts/chassis/E60 |
| https://www.bmv.parts/chassis/E61 |
| https://www.bmv.parts/chassis/E70 |
| https://www.bmv.parts/chassis/E90 |
| https://www.bmv.parts/chassis/E92 |
| https://www.bmv.parts/chassis/E93 |
| https://www.bmv.parts/chassis/F10 |
| https://www.bmv.parts/chassis/F15 |
| https://www.bmv.parts/chassis/F20 |
| https://www.bmv.parts/chassis/F25 |
| https://www.bmv.parts/chassis/F30 |
| https://www.bmv.parts/chassis/F80 |
| https://www.bmv.parts/chassis/F82 |
| https://www.bmv.parts/chassis/F87 |
| https://www.bmv.parts/chassis/F87N |
| https://www.bmv.parts/chassis/G05 |
| https://www.bmv.parts/chassis/G20 |
| https://www.bmv.parts/chassis/G22 |
| https://www.bmv.parts/chassis/G30 |
| https://www.bmv.parts/chassis/G80 |
| https://www.bmv.parts/chassis/G82 |
| https://www.bmv.parts/chassis/G87 |

---

### Model hub pages (`/hub/:chassis`)

| URL |
|-----|
| https://www.bmv.parts/hub/E46 |
| https://www.bmv.parts/hub/E60 |
| https://www.bmv.parts/hub/E70 |
| https://www.bmv.parts/hub/E90 |
| https://www.bmv.parts/hub/F10 |
| https://www.bmv.parts/hub/F15 |
| https://www.bmv.parts/hub/F25 |
| https://www.bmv.parts/hub/F30 |
| https://www.bmv.parts/hub/F87 |
| https://www.bmv.parts/hub/F87N |
| https://www.bmv.parts/hub/G05 |
| https://www.bmv.parts/hub/G20 |
| https://www.bmv.parts/hub/G30 |
| https://www.bmv.parts/hub/G80 |

---

### Car detail pages (`/car/:slug`) — representative sample

| URL | Model |
|-----|-------|
| https://www.bmv.parts/car/e46-m3-47606 | E46 M3 |
| https://www.bmv.parts/car/e46-325ti-47656 | E46 325ti |
| https://www.bmv.parts/car/e60-m5-48421 | E60 M5 |
| https://www.bmv.parts/car/e60-550i-48805 | E60 550i |
| https://www.bmv.parts/car/e70-x5-3-0i-47740 | E70 X5 3.0i |
| https://www.bmv.parts/car/e53-x5-4-4i-m62-47741 | E53 X5 4.4i |
| https://www.bmv.parts/car/e90-m3-47606 | E90 M3 `[example]` |
| https://www.bmv.parts/car/f10-m5-48421 | F10 M5 `[example]` |
| https://www.bmv.parts/car/f30-320i-49341 | F30 320i `[example]` |

---

### Parts by chassis + category (`/parts/:chassis/:category`)

> Category slug is the category name lowercased and hyphenated. All chassis × category combos exist — examples below.

| URL | What it shows |
|-----|--------------|
| https://www.bmv.parts/parts/E46/brakes | E46 Brakes |
| https://www.bmv.parts/parts/E46/engine | E46 Engine |
| https://www.bmv.parts/parts/E46/electrical | E46 Electrical |
| https://www.bmv.parts/parts/E90/brakes | E90 Brakes |
| https://www.bmv.parts/parts/F30/body-hardware | F30 Body & Hardware |
| https://www.bmv.parts/parts/F30/engine | F30 Engine |
| https://www.bmv.parts/parts/G20/brakes | G20 Brakes |
| https://www.bmv.parts/parts/G80/engine | G80 Engine |

Full category list: A/C & Heating · Additional Parts · Air & Fuel Delivery · Audio/Navigation/Electronic Systems · Automatic transmission · Belts & Cooling · Body & Hardware · Bodywork · Brakes · Charging & Starting · Clutch · Communication systems · Distance Systems/Cruise Control · Drive shaft · Driveline & Axles · Electrical · Emission Control & Exhaust · Engine · and more.

---

### Part detail pages (`/part/:partNumberClean`)

| URL |
|-----|
| https://www.bmv.parts/part/52107147481 |
| https://www.bmv.parts/part/52107147478 |
| https://www.bmv.parts/part/52107147462 |
| https://www.bmv.parts/part/52106955520 |
| https://www.bmv.parts/part/52106955518 |
| https://www.bmv.parts/part/52106955519 |
| https://www.bmv.parts/part/52106955517 |
| https://www.bmv.parts/part/52107139521 |

---

### VIN decoder on bmv.parts (`/vin` and `/vin/:vin`)

| URL |
|-----|
| https://www.bmv.parts/vin |
| https://www.bmv.parts/vin/WBA61DP0009K17710 |
| https://www.bmv.parts/vin/WBAUU31040KY36955 |
| https://www.bmv.parts/vin/WBA71GP0409490249 |
| https://www.bmv.parts/vin/WBA31AJ050CL22997 |
| https://www.bmv.parts/vin/WBA4J51080BNB0416 |
| https://www.bmv.parts/vin/WBS2U720107F68697 |

---

### Servicing with VIN (`/servicing/:vin`)

| URL |
|-----|
| https://www.bmv.parts/servicing |
| https://www.bmv.parts/servicing/WBA61DP0009K17710 |
| https://www.bmv.parts/servicing/WBS2U720107F68697 |

---

### Content pages (`/guides`, `/compare`, `/data`)

> No content published in production yet — pages render empty/placeholder states.

| URL | Status |
|-----|--------|
| https://www.bmv.parts/guides/:slug | No slugs in prod yet |
| https://www.bmv.parts/compare/:slug | No slugs in prod yet |
| https://www.bmv.parts/data/:slug | No slugs in prod yet |

---

### Localised pages (10 locale prefixes × all core routes)

Locale prefixes: `de` · `fr` · `es` · `it` · `zh` · `ko` · `es-mx` · `en-za` · `pt-br` · `ru`

| URL pattern | Example |
|-------------|---------|
| `/{locale}/` | https://www.bmv.parts/de |
| `/{locale}/search` | https://www.bmv.parts/de/search |
| `/{locale}/part-finder` | https://www.bmv.parts/fr/part-finder |
| `/{locale}/vin` | https://www.bmv.parts/es/vin |
| `/{locale}/vin/:vin` | https://www.bmv.parts/de/vin/WBS2U720107F68697 |
| `/{locale}/servicing` | https://www.bmv.parts/de/servicing |
| `/{locale}/models` | https://www.bmv.parts/de/models |
| `/{locale}/series/:series` | https://www.bmv.parts/de/series/M |
| `/{locale}/chassis/:code` | https://www.bmv.parts/de/chassis/G80 |
| `/{locale}/car/:slug` | https://www.bmv.parts/de/car/e46-m3-47606 |
| `/{locale}/part/:partNo` | https://www.bmv.parts/de/part/52107147481 |
| `/{locale}/about` | https://www.bmv.parts/de/about |
| `/{locale}/recommended-sites` | https://www.bmv.parts/de/recommended-sites |
| `/{locale}/my-cars` | https://www.bmv.parts/de/my-cars `[auth]` |

---

## bmv.vin

### Home

| URL |
|-----|
| https://www.bmv.vin/ |
| https://bmv.vin/ |

---

### Individual VIN pages (`/:vin`)

| URL | Vehicle |
|-----|---------|
| https://www.bmv.vin/WBS2U720107F68697 | 2020 M2 Competition F87N |
| https://www.bmv.vin/WBA61DP0009K17710 | BMW (recent) |
| https://www.bmv.vin/WBAUU31040KY36955 | BMW |
| https://www.bmv.vin/WBA71GP0409490249 | BMW |
| https://www.bmv.vin/WB103680X5ZM02288 | BMW |
| https://www.bmv.vin/WBA31AJ050CL22997 | BMW |
| https://www.bmv.vin/WB10403DXXZG98347 | BMW |
| https://www.bmv.vin/WBA21EU0709V26728 | BMW |
| https://www.bmv.vin/WBA41EU0709U76535 | BMW |
| https://www.bmv.vin/WBA4J51080BNB0416 | BMW |

---

### VIN tool landing pages (Template A)

| URL | Tool |
|-----|------|
| https://www.bmv.vin/bmw-vin-decoder | Generic VIN decoder |
| https://www.bmv.vin/bmw-build-sheet-lookup | Build sheet lookup |
| https://www.bmv.vin/bmw-paint-code-lookup | Paint code lookup |
| https://www.bmv.vin/bmw-production-date-lookup | Production date lookup |
| https://www.bmv.vin/bmw-engine-code-lookup | Engine code lookup |
| https://www.bmv.vin/bmw-options-lookup | Options / SA code lookup |
| https://www.bmv.vin/bmw-plant-code-lookup | Plant code lookup |
| https://www.bmv.vin/bmw-model-year-lookup | Model year lookup |

---

### Brand decoder hub (`/decoder/:brand`)

| URL |
|-----|
| https://www.bmv.vin/decoder/bmw |

---

### Facet index pages

| URL | Lists all values for facet |
|-----|--------------------------|
| https://www.bmv.vin/chassis | All chassis codes |
| https://www.bmv.vin/year | All model years |
| https://www.bmv.vin/plant | All production plants |
| https://www.bmv.vin/market | All markets |
| https://www.bmv.vin/paint | All paint codes |
| https://www.bmv.vin/option | All SA option codes |

---

### Facet hub pages (`/:facet/:value`) — examples

| URL | What it shows |
|-----|--------------|
| https://www.bmv.vin/chassis/F87N | All F87N VINs in catalog |
| https://www.bmv.vin/chassis/G80 | All G80 VINs in catalog |
| https://www.bmv.vin/chassis/F82 | All F82 VINs in catalog |
| https://www.bmv.vin/chassis/E90 | All E90 VINs in catalog |
| https://www.bmv.vin/year/2020 | 2020 model year VINs |
| https://www.bmv.vin/year/2023 | 2023 model year VINs |
| https://www.bmv.vin/year/2025 | 2025 model year VINs |
| https://www.bmv.vin/plant/dingolfing | Dingolfing plant VINs |
| https://www.bmv.vin/plant/munich | Munich plant VINs |
| https://www.bmv.vin/plant/regensburg | Regensburg plant VINs |
| https://www.bmv.vin/plant/spartanburg | Spartanburg (X models) |
| https://www.bmv.vin/plant/oxford | Oxford (MINI) |
| https://www.bmv.vin/plant/berlin | Berlin (motorcycles) |
| https://www.bmv.vin/plant/leipzig | Leipzig |
| https://www.bmv.vin/plant/rolls-royce | Rolls-Royce |
| https://www.bmv.vin/market/europe-left-steering | Europe LHD |
| https://www.bmv.vin/market/europe-right-steering | Europe RHD |
| https://www.bmv.vin/market/usa-left-steering | USA |
| https://www.bmv.vin/market/south-korea-left-steering | South Korea |
| https://www.bmv.vin/paint/alpine-white | Alpine White |
| https://www.bmv.vin/paint/jet-black | Jet Black |
| https://www.bmv.vin/paint/melbourne-red | Melbourne Red |
| https://www.bmv.vin/paint/mineral-grey | Mineral Grey |
| https://www.bmv.vin/option/sa-205 | SA 205 option VINs |
| https://www.bmv.vin/option/sa-302 | SA 302 option VINs |
| https://www.bmv.vin/option/sa-494 | SA 494 option VINs |

---

### BMW model pages (`/bmw-:rest`)

> Catch-all route — any BMW model slug works. Examples:

| URL |
|-----|
| https://www.bmv.vin/bmw-m2 |
| https://www.bmv.vin/bmw-m3 |
| https://www.bmv.vin/bmw-m4 |
| https://www.bmv.vin/bmw-m5 |
| https://www.bmv.vin/bmw-3-series |
| https://www.bmv.vin/bmw-5-series |
| https://www.bmv.vin/bmw-x5 |
| https://www.bmv.vin/bmw-f87 |
| https://www.bmv.vin/bmw-g80 |

---

### Glossary (`/glossary` and `/glossary/:term`)

| URL |
|-----|
| https://www.bmv.vin/glossary |
| https://www.bmv.vin/glossary/check-digit |
| https://www.bmv.vin/glossary/model-year-letter |
| https://www.bmv.vin/glossary/paint-alpine-white |
| https://www.bmv.vin/glossary/paint-jet-black |
| https://www.bmv.vin/glossary/paint-melbourne-red |
| https://www.bmv.vin/glossary/paint-mineral-grey |
| https://www.bmv.vin/glossary/paint-tanzanite-blue |
| https://www.bmv.vin/glossary/plant-berlin |
| https://www.bmv.vin/glossary/plant-code |
| https://www.bmv.vin/glossary/plant-dingolfing |
| https://www.bmv.vin/glossary/plant-leipzig |
| https://www.bmv.vin/glossary/plant-munich |
| https://www.bmv.vin/glossary/plant-oxford |
| https://www.bmv.vin/glossary/plant-regensburg |
| https://www.bmv.vin/glossary/plant-rolls-royce |
| https://www.bmv.vin/glossary/plant-rosslyn |
| https://www.bmv.vin/glossary/plant-spartanburg |
| https://www.bmv.vin/glossary/sa-205 |
| https://www.bmv.vin/glossary/sa-2vb |
| https://www.bmv.vin/glossary/sa-302 |
| https://www.bmv.vin/glossary/sa-319 |
| https://www.bmv.vin/glossary/sa-322 |
| https://www.bmv.vin/glossary/sa-403 |
| https://www.bmv.vin/glossary/sa-423 |
| https://www.bmv.vin/glossary/sa-465 |
| https://www.bmv.vin/glossary/sa-494 |
| https://www.bmv.vin/glossary/sa-548 |
| https://www.bmv.vin/glossary/sa-688 |
| https://www.bmv.vin/glossary/sa-823 |
| https://www.bmv.vin/glossary/sequence-number |

---

### Guide pages (`/guide` and `/guide/:slug`)

| URL | Status |
|-----|--------|
| https://www.bmv.vin/guide | Guide index |
| https://www.bmv.vin/guide/:slug | No slugs published in prod yet |

---

### Compare / Data pages

| URL | Status |
|-----|--------|
| https://www.bmv.vin/compare/:slug | No slugs published in prod yet |
| https://www.bmv.vin/data/:slug | No slugs published in prod yet |

---

## Notes for E2E testing

- **SSR pages**: All `bmv.vin/*` routes and `bmv.parts/car/*`, `bmv.parts/part/*` routes are server-rendered. Check that `<title>`, `<meta description>`, and `<h1>` match expected content in the raw HTML (not just after JS hydration).
- **Auth-gated pages**: `/my-cars`, `/admin`, `/admin/realoem-backfill` require a logged-in session — test both the logged-out redirect and the logged-in view.
- **404 behaviour**: Any unknown path on either domain should render the Not Found page (not a blank screen or JS error).
- **Cross-domain redirects**: Catalog paths (`/car/*`, `/part/*`, `/search`, `/models`) requested on `bmv.vin` should 301-redirect to `bmv.parts`. VIN paths (`/vin/*`) requested on `bmv.parts` should redirect to `bmv.vin`.
- **Locale variants**: Localized routes (`/de/*`, `/fr/*`, etc.) are only on `bmv.parts` — they should 404 or redirect on `bmv.vin`.
- **Loading states**: Part detail, car detail, VIN pages, and part-finder all have skeleton/loading states — check that spinners resolve and do not remain permanently.
