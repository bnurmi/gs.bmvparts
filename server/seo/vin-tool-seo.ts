// =============================================================================
// VIN Tool SEO SSR Builders (Task #259)
// =============================================================================
// SSR page builders for:
//   Template A — VIN tool landing pages (/bmw-vin-decoder, /bmw-build-sheet-lookup, …)
//   Template B — Model-specific VIN pages (/bmw-{chassis}-vin-decoder)
//   Template E — Comparison pages (/compare/:slug)
//   Template F — Statistics pages (/data/:slug)
//
// Each builder returns VinHostSeoBundle (same interface as bmv-vin-pages.ts)
// so the SSR middleware can call them alongside the existing builders.
// =============================================================================

import type { LocaleCode } from "../../shared/i18n";
import type { VinHostSeoBundle } from "./bmv-vin-pages";
import { db } from "../storage";
import { sql } from "drizzle-orm";

const SITE_NAME = "BMV.VIN";
const BMV_VIN_BASE = "https://bmv.vin";
const BMV_PARTS_BASE = "https://bmv.parts";

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const escAttr = esc;
function safeJson(v: unknown): string {
  return JSON.stringify(v).replace(/<\/(script)/gi, "<\\/$1");
}

function buildHead(opts: {
  title: string;
  description: string;
  canonicalUrl: string;
  noindex?: boolean;
  jsonLd: unknown[];
  ogImage?: string;
  ogType?: "website" | "article";
}): string {
  const { title, description, canonicalUrl, noindex, jsonLd, ogImage, ogType = "website" } = opts;
  const parts: string[] = [];
  parts.push(`<title data-bmv-ssr>${esc(title)}</title>`);
  parts.push(`<meta data-bmv-ssr name="description" content="${escAttr(description)}" />`);
  if (noindex) {
    parts.push(`<meta data-bmv-ssr name="robots" content="noindex,follow" />`);
  }
  parts.push(`<link data-bmv-ssr rel="canonical" href="${escAttr(canonicalUrl)}" />`);
  parts.push(`<meta data-bmv-ssr property="og:title" content="${escAttr(title)}" />`);
  parts.push(`<meta data-bmv-ssr property="og:description" content="${escAttr(description)}" />`);
  parts.push(`<meta data-bmv-ssr property="og:url" content="${escAttr(canonicalUrl)}" />`);
  parts.push(`<meta data-bmv-ssr property="og:site_name" content="${SITE_NAME}" />`);
  parts.push(`<meta data-bmv-ssr property="og:type" content="${ogType}" />`);
  if (ogImage) {
    parts.push(`<meta data-bmv-ssr property="og:image" content="${escAttr(ogImage)}" />`);
  }
  parts.push(`<meta data-bmv-ssr name="twitter:card" content="summary_large_image" />`);
  parts.push(`<meta data-bmv-ssr name="twitter:title" content="${escAttr(title)}" />`);
  parts.push(`<meta data-bmv-ssr name="twitter:description" content="${escAttr(description)}" />`);
  for (const node of jsonLd) {
    parts.push(`<script data-bmv-ssr type="application/ld+json">${safeJson(node)}</script>`);
  }
  return parts.join("\n    ");
}

function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": item.name,
      "item": item.url,
    })),
  };
}

function faqJsonLd(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(f => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": { "@type": "Answer", "text": f.a },
    })),
  };
}

// ---------------------------------------------------------------------------
// Template A — VIN Tool Definition
// ---------------------------------------------------------------------------
interface VinToolDef {
  slug: string;
  toolName: string;
  keyword: string;
  h1: string;
  quickAnswer: string;
  shows: string[];
  howToSteps: { name: string; text: string }[];
  faqs: { q: string; a: string }[];
  relatedTools: { label: string; href: string }[];
  /** 2-3 real bmv.vin facet hub pages relevant to this lookup tool.
   *  Rendered server-side as an "Explore real BMW VIN data" section so
   *  Googlebot has a crawl path from the lookup page into facet hubs. */
  facetExamples?: { label: string; href: string; description: string }[];
  isHub?: boolean;
}

const CARVERTICAL_LINK = "https://www.carvertical.com/lp/start?a=69ed8f8d0e46e&b=aa3269f9&chan=bmvparts&voucher=bmv";

const VIN_TOOLS: VinToolDef[] = [
  {
    slug: "bmw-vin-decoder",
    toolName: "VIN Decoder",
    keyword: "BMW VIN decoder",
    h1: "BMW VIN Decoder — Free, Instant & Accurate",
    quickAnswer: "A BMW VIN decoder reveals your vehicle's complete factory specification from its 17-character Vehicle Identification Number — including build sheet, options, paint code, production date, engine, and plant. Enter any BMW VIN below to decode it instantly, free, with no registration required.",
    shows: [
      "Full factory build sheet with all fitted options (SA codes)",
      "Original paint code and colour name",
      "Production date and manufacturing plant location",
      "Engine code, transmission type, and drivetrain",
      "Model year, body type, and market specification",
      "VIN structure breakdown (WMI, VDS, VIS)",
    ],
    howToSteps: [
      { name: "Find your BMW VIN", text: "Locate your 17-character VIN on the dashboard (driver's side, visible through the windscreen), door jamb sticker, or vehicle registration documents." },
      { name: "Enter VIN above", text: "Type or paste your VIN into the decoder field above and click Decode." },
      { name: "Review your results", text: "Your full build sheet, options, paint code, production date, and plant information will display instantly." },
    ],
    faqs: [
      { q: "What is a BMW VIN number?", a: "A BMW VIN (Vehicle Identification Number) is a unique 17-character code assigned to every BMW vehicle at the factory. It encodes the manufacturer, vehicle type, engine, check digit, model year, production plant, and sequential serial number." },
      { q: "Where can I find my BMW VIN?", a: "Your BMW VIN appears on the dashboard (visible through the windscreen from outside), on the driver's door jamb label, in your vehicle registration documents, and on the engine bay plate." },
      { q: "Is this BMW VIN decoder free?", a: "Yes, BMV.vin is completely free to use with no registration required. Simply enter your 17-digit VIN to instantly decode your BMW." },
      { q: "What data does the BMW VIN decoder show?", a: "The decoder reveals your full factory build sheet including SA option codes, original paint code, production date, manufacturing plant, engine code, transmission type, drivetrain, body type, model year, and market specification." },
      { q: "Can I decode a MINI, ALPINA, or Rolls-Royce VIN?", a: "Yes — BMV.vin decodes VINs for all BMW Group vehicles including BMW, MINI, ALPINA, Rolls-Royce, and BMW Motorrad." },
      { q: "What if my BMW VIN returns no results?", a: "Some older vehicles or very new models may not have enriched factory data available yet. The VIN structure (model year, plant, production sequence) is always decoded. Options and paint data require BMW's factory configuration records." },
      { q: "What are BMW SA codes?", a: "SA (Sonderausstattung) codes are BMW's internal codes for every factory-fitted option — from adaptive LED headlights (S552A) to heated steering wheels (S4HA). Your build sheet lists every SA code your specific car was built with." },
      { q: "How accurate is this BMW VIN decoder?", a: "BMV.vin uses real BMW factory data sourced from the ETK parts catalog and BMW's official configuration systems. It is more accurate than generic VIN databases for BMW-specific information." },
    ],
    relatedTools: [
      { label: "BMW Build Sheet Lookup", href: "/bmw-build-sheet-lookup" },
      { label: "BMW Paint Code Lookup", href: "/bmw-paint-code-lookup" },
      { label: "BMW Production Date Lookup", href: "/bmw-production-date-lookup" },
      { label: "BMW Engine Code Lookup", href: "/bmw-engine-code-lookup" },
    ],
    isHub: true,
  },
  {
    slug: "bmw-build-sheet-lookup",
    toolName: "Build Sheet Lookup",
    keyword: "BMW build sheet by VIN",
    h1: "BMW Build Sheet Lookup — Find Your Factory Spec by VIN",
    quickAnswer: "A BMW build sheet lists every factory-fitted option on your specific vehicle, identified by BMW SA (Sonderausstattung) codes. Enter your BMW VIN to instantly retrieve your original factory build sheet — free, no registration, backed by real BMW factory data.",
    shows: [
      "Complete list of SA (Sonderausstattung) option codes",
      "Human-readable option names for each SA code",
      "Option categories (exterior, interior, audio, driver assistance, etc.)",
      "Original factory colour code",
      "Upholstery and interior trim specification",
    ],
    howToSteps: [
      { name: "Locate your BMW VIN", text: "Find your 17-digit VIN on the dashboard, door jamb, or registration documents." },
      { name: "Enter VIN below", text: "Paste your VIN into the field and click Decode to retrieve your build sheet." },
      { name: "Read your SA codes", text: "Each option is listed with its SA code and a plain-English description of what was factory-fitted." },
    ],
    faqs: [
      { q: "What is a BMW build sheet?", a: "A BMW build sheet (also called a Fahrzeugauftrag or FA) is the complete factory specification document listing every option ordered on your specific vehicle. It is identified by SA (Sonderausstattung) codes." },
      { q: "What are BMW SA codes?", a: "SA codes are BMW's standardised equipment codes for factory-fitted options. Examples include S452A (Adaptive LED Headlights), S430A (Park Distance Control), and S688A (High-gloss Shadow Line trim)." },
      { q: "Why would I need my BMW build sheet?", a: "Your build sheet is useful when buying or selling a used BMW (to verify original spec), when ordering parts (to confirm the correct variant), and when verifying if optional features like adaptive cruise or heated seats were factory-fitted or dealer-added." },
      { q: "Can I get my BMW build sheet from the dealer?", a: "Yes, BMW dealers can access build sheet data via their dealer systems. BMV.vin offers the same information instantly and for free without needing to contact a dealer." },
      { q: "How do I know which SA codes mean which features?", a: "BMV.vin translates every SA code into a plain-English description automatically. You can also search the BMW SA code list on our platform." },
      { q: "Does my build sheet show dealer-added options?", a: "No — build sheets show only factory-fitted options. Features added by dealers after production are not included." },
      { q: "Can I find my build sheet for older BMW models?", a: "Yes, BMV.vin has factory data covering BMW models from the 1980s through to current production." },
      { q: "What if my SA codes are not listed?", a: "Very early or very new models may have limited option data. The VIN structure (year, plant, model) is always decoded. Option availability depends on BMW's factory record coverage." },
    ],
    relatedTools: [
      { label: "BMW VIN Decoder", href: "/bmw-vin-decoder" },
      { label: "BMW Options Lookup", href: "/bmw-options-lookup" },
      { label: "BMW Paint Code Lookup", href: "/bmw-paint-code-lookup" },
    ],
    facetExamples: [
      { label: "BMW G20 3 Series builds", href: "/chassis/g20", description: "Browse decoded VINs for the F30 successor — the G20 3 Series — and inspect which SA options appear most often on real cars." },
      { label: "2022 model year builds", href: "/year/2022", description: "Explore factory SA codes across all BMW Group VINs decoded for model year 2022." },
      { label: "SA option S552A — Adaptive LED Headlights", href: "/option/s552a", description: "See how many decoded BMWs carry factory SA code S552A (Adaptive LED Headlights) and which chassis it appears on most." },
    ],
  },
  {
    slug: "bmw-paint-code-lookup",
    toolName: "Paint Code Lookup",
    keyword: "BMW paint code by VIN",
    h1: "BMW Paint Code Lookup — Find Your Original Colour by VIN",
    quickAnswer: "Every BMW is sprayed with a specific paint colour identified by a 3-4 digit code (e.g., 475 = Black Sapphire Metallic, A96 = Brooklyn Grey Metallic). Enter your VIN to find your original BMW paint code instantly — perfect for touch-up kits, resprays, and insurance claims.",
    shows: [
      "Original factory paint code (3-4 digit BMW colour code)",
      "Colour name (e.g., Black Sapphire Metallic, Alpine White)",
      "Paint type (metallic, solid, individual, matte)",
      "Colour swatch preview",
    ],
    howToSteps: [
      { name: "Find your VIN", text: "Your 17-digit VIN is on the dashboard, door jamb, or registration." },
      { name: "Enter and decode", text: "Paste your VIN into the tool and click Decode to retrieve your paint code." },
      { name: "Use your paint code", text: "Use the code when ordering touch-up paint, requesting a body shop respray, or for insurance documentation." },
    ],
    faqs: [
      { q: "How do I find my BMW paint code from the VIN?", a: "Enter your 17-digit BMW VIN into BMV.vin to instantly retrieve your factory paint code. The code is also found on the vehicle identification label inside the driver's door jamb." },
      { q: "What does a BMW paint code look like?", a: "BMW paint codes are typically 3 characters (e.g., 300, 475, A96). Some Individual and special colours use longer codes. The code is always paired with a colour name." },
      { q: "Where is the BMW paint code sticker?", a: "The paint code label is on the driver's door jamb sticker (look for 'Farbe' or 'Paint'). It is also accessible via your VIN through BMV.vin." },
      { q: "Can I order touch-up paint using my BMW paint code?", a: "Yes. Your BMW paint code is the definitive reference for ordering factory-matched touch-up paint, aerosol cans, or requesting a body shop to spray-match your colour." },
      { q: "What is BMW Individual paint?", a: "BMW Individual is a personalisation programme offering unique and non-standard colours. Individual colours have their own codes and are more expensive to replicate." },
      { q: "Why doesn't my VIN show a paint code?", a: "Some vehicles — particularly older models or very recent builds — may not have paint data in our system. The paint code is always on the door jamb sticker as a backup." },
      { q: "Are BMW paint codes the same across all models?", a: "BMW uses the same paint code system across all models. Colour 475 (Black Sapphire Metallic) is the same shade whether it is on a 3 Series or an X5." },
      { q: "What is the difference between metallic and solid BMW paint?", a: "Metallic paint contains metal flakes for a shimmering effect and is harder to match precisely. Solid paint has no metallic flakes and is generally easier to touch up." },
    ],
    relatedTools: [
      { label: "BMW VIN Decoder", href: "/bmw-vin-decoder" },
      { label: "BMW Build Sheet Lookup", href: "/bmw-build-sheet-lookup" },
      { label: "BMW Production Date Lookup", href: "/bmw-production-date-lookup" },
    ],
    facetExamples: [
      { label: "Paint code 475 — Black Sapphire Metallic", href: "/paint/475", description: "Browse every decoded BMW painted in 475 Black Sapphire Metallic — the most popular BMW colour — and see which chassis and years it was offered on." },
      { label: "Paint code 300 — Alpine White", href: "/paint/300", description: "Alpine White (300) is BMW's best-selling solid colour. See the full cohort of decoded VINs wearing this timeless shade." },
      { label: "Paint code A96 — Brooklyn Grey Metallic", href: "/paint/a96", description: "Brooklyn Grey Metallic launched on the G20 era and quickly became a G80 M3 and G82 M4 staple. Explore the cohort." },
    ],
  },
  {
    slug: "bmw-production-date-lookup",
    toolName: "Production Date Lookup",
    keyword: "BMW production date by VIN",
    h1: "BMW Production Date Lookup — Find Build Date by VIN",
    quickAnswer: "Your BMW's production date (build date) is the month and year it was manufactured at the factory — different from the compliance date (when it was registered for road use in your market). Enter your BMW VIN to find your exact production date instantly.",
    shows: [
      "Production month and year (e.g., 03/2021)",
      "Manufacturing plant name and location",
      "Model year encoding in VIN",
      "Days between production and registration (where available)",
    ],
    howToSteps: [
      { name: "Get your VIN", text: "Find your 17-digit BMW VIN on the dashboard, door jamb, or registration certificate." },
      { name: "Decode your VIN", text: "Enter the VIN into the field and click Decode to retrieve production date and plant information." },
      { name: "Read the date", text: "Your production month/year and manufacturing plant will display along with your full build data." },
    ],
    faqs: [
      { q: "What is the BMW production date?", a: "The production date (Produktionsdatum) is the month and year your BMW was manufactured at the factory. This is distinct from the compliance date (first registration) which may be months later." },
      { q: "Why is the BMW production date different from registration date?", a: "After production, vehicles are transported to importers, may spend time in dealer stock, and then registered when sold. The gap between production and compliance can range from weeks to over a year for ex-demonstrator or unsold stock." },
      { q: "Why does the production date matter?", a: "The production date determines which production revision your vehicle is built to, affects warranty start calculations in some markets, and is used for insurance valuations, compliance plate dating, and ordering era-correct parts." },
      { q: "How accurate is the production date from the VIN?", a: "BMV.vin retrieves production date from BMW's factory records, which is the most accurate source available. The VIN itself encodes the model year (position 10) but not the exact production month — that comes from factory data." },
      { q: "What is the BMW production plant code?", a: "BMW production plant codes (e.g., 05 = Dingolfing, 06 = Munich, 38 = Oxford for MINI) appear in position 11 of the VIN and identify where the vehicle was built." },
      { q: "Can I find when a BMW was built by VIN?", a: "Yes — enter any BMW VIN into BMV.vin to retrieve the production month and year from BMW's factory records." },
      { q: "Does production date affect BMW parts compatibility?", a: "Yes. Parts compatibility often depends on production date rather than model year (many mid-cycle revisions are tied to a production date, not a calendar year change)." },
      { q: "What is the difference between build date and compliance date in Australia?", a: "In Australia, build date is when the car was manufactured; compliance date is when it was certified to Australian Design Rules (ADRs). For insurance and registration purposes, compliance date is typically used." },
    ],
    relatedTools: [
      { label: "BMW VIN Decoder", href: "/bmw-vin-decoder" },
      { label: "BMW Plant Code Lookup", href: "/bmw-plant-code-lookup" },
      { label: "BMW Model Year Lookup", href: "/bmw-model-year-lookup" },
    ],
    facetExamples: [
      { label: "Model year 2022 builds", href: "/year/2022", description: "Browse decoded BMW Group VINs from model year 2022 — see production dates, chassis, plants, and SA codes for that cohort." },
      { label: "Model year 2020 builds", href: "/year/2020", description: "Explore model year 2020 builds spanning the G-series generation: G30, G20, G05, G07 and more." },
      { label: "Model year 2019 builds", href: "/year/2019", description: "Model year 2019 was the first year of the G20 3 Series. See production dates and factory specs across the full 2019 cohort." },
    ],
  },
  {
    slug: "bmw-engine-code-lookup",
    toolName: "Engine Code Lookup",
    keyword: "BMW engine code by VIN",
    h1: "BMW Engine Code Lookup — Find Engine & Transmission by VIN",
    quickAnswer: "BMW engine codes (e.g., B58B30M1, N55B30M0, S58B30M0) identify the exact engine variant fitted to your vehicle. Enter your BMW VIN to instantly look up your engine code, displacement, power output, and transmission type.",
    shows: [
      "Engine code (e.g., B58B30M1, N55B30M0, S58B30M0)",
      "Engine displacement and cylinder count",
      "Rated power output (kW and bhp)",
      "Transmission type (automatic, manual, DCT)",
      "Drivetrain (RWD, xDrive AWD, FWD)",
    ],
    howToSteps: [
      { name: "Find your VIN", text: "Locate your 17-digit BMW VIN on the dashboard or door jamb." },
      { name: "Enter your VIN", text: "Paste the VIN into the decoder and click Decode." },
      { name: "Read engine details", text: "Your engine code, displacement, power, and transmission type display in the Vehicle tab." },
    ],
    faqs: [
      { q: "How do I find my BMW engine code from the VIN?", a: "Enter your BMW VIN into BMV.vin. The engine code appears in the Vehicle tab of your decode results, cross-referenced from BMW's type code database." },
      { q: "What does the BMW engine code mean?", a: "BMW engine codes follow a structured format. For example, B58B30M1: B=generation, 58=family identifier, B=petrol, 30=3.0 litres, M1=first M Power variant. The letter prefix identifies the engine generation (M=classic, N=modern, B=latest)." },
      { q: "Where else can I find my BMW engine code?", a: "The engine code is stamped on the engine block and listed on your vehicle registration document. BMV.vin retrieves it from BMW's type code database using your VIN." },
      { q: "What is the difference between BMW B58 and N55?", a: "Both are turbocharged 3.0-litre inline-six engines. The B58 (2015–present) is the newer generation with improved efficiency, revised turbo, and higher power output. The N55 (2009–2016) is the previous generation." },
      { q: "Can I find gearbox type by BMW VIN?", a: "Yes — the transmission type (8-speed ZF automatic, 6-speed manual, 7-speed DCT) is included in the decode results where factory data is available." },
      { q: "How do I know if my BMW has xDrive?", a: "xDrive (BMW's all-wheel drive system) is identified in the model designation and VIN. BMV.vin decodes the drivetrain configuration from factory type codes." },
      { q: "What BMW engines are most reliable?", a: "BMW's inline-six engines (B58, N52, N55) and diesel units (B57, N57) are generally regarded as reliable. The B58 in particular is widely praised for durability and performance." },
      { q: "Can I upgrade my BMW engine using VIN data?", a: "Knowing your exact engine variant is essential for sourcing compatible performance upgrades, ECU tunes, and aftermarket parts. Your VIN confirms which specific variant you have." },
    ],
    relatedTools: [
      { label: "BMW VIN Decoder", href: "/bmw-vin-decoder" },
      { label: "BMW Build Sheet Lookup", href: "/bmw-build-sheet-lookup" },
      { label: "BMW Model Year Lookup", href: "/bmw-model-year-lookup" },
    ],
    facetExamples: [
      { label: "BMW G80 M3 builds", href: "/chassis/g80", description: "The G80 M3 carries the S58B30M0/M1 twin-turbo six. Browse decoded G80 VINs to see engine codes, build dates, and option combinations." },
      { label: "BMW G30 5 Series builds", href: "/chassis/g30", description: "The G30 5 Series spans B47/B57 diesel and B48/B58 petrol engines. Browse the full decoded cohort and its engine code spread." },
      { label: "BMW G20 3 Series builds", href: "/chassis/g20", description: "The G20 generation introduced the B48 four-cylinder and B58 six-cylinder to the 3 Series. Explore engine codes across the entire G20 cohort." },
    ],
  },
  {
    slug: "bmw-options-lookup",
    toolName: "Options Lookup",
    keyword: "BMW factory options lookup",
    h1: "BMW Options Lookup — Find Factory Options by VIN",
    quickAnswer: "BMW factory options are identified by SA (Sonderausstattung) codes on your build sheet. Enter your BMW VIN to see every option ordered on your specific vehicle — from M Sport suspension to premium audio, adaptive headlights to heated seats.",
    shows: [
      "Full list of factory-fitted SA option codes",
      "Plain-English descriptions for each option code",
      "Option categories (exterior, interior, technology, safety)",
      "Premium, standard, and M-package equipment identification",
    ],
    howToSteps: [
      { name: "Find your VIN", text: "Your 17-digit VIN is on the dashboard, door jamb, or registration." },
      { name: "Enter your VIN", text: "Paste it into the field above and click Decode." },
      { name: "Browse your options", text: "Every factory option is listed with its SA code and a clear description." },
    ],
    faqs: [
      { q: "What are BMW factory options?", a: "Factory options (Sonderausstattung) are features ordered at the factory when the vehicle was built. They appear on the original order form and build sheet with SA codes." },
      { q: "How do SA codes work on BMW?", a: "BMW SA codes are standardised 4-character identifiers (e.g., S552A = Adaptive LED Headlights, S4HA = Heated Steering Wheel). Every factory option has a unique SA code." },
      { q: "Can I check if my BMW has heated seats from the VIN?", a: "Yes — enter your VIN into BMV.vin. If heated seats were factory-fitted (SA code S494A or similar), they will appear on your build sheet." },
      { q: "How do I know what options my BMW is missing?", a: "Compare your SA code list against the full option catalogue for your model. Absent SA codes indicate options not ordered — these may be retro-fittable in some cases." },
      { q: "Do dealer-fitted options show on the VIN?", a: "No. Build sheets record factory options only. Options installed by dealers are not recorded in BMW's factory system." },
      { q: "What is the difference between standard equipment and options on a BMW?", a: "Standard equipment comes on every example of a specific model grade. Options (SA codes) are additional items ordered at extra cost by the original buyer." },
      { q: "Can I add options to my BMW after purchase?", a: "Some options can be coded or retrofitted. BMV.vin can tell you what your vehicle was built with; a BMW specialist can advise on what is feasible to add." },
      { q: "Why do some BMW options not appear in my decode?", a: "Option data depends on BMW factory records being available in our system. Most post-2005 models have complete records. Older vehicles may have partial data." },
    ],
    relatedTools: [
      { label: "BMW VIN Decoder", href: "/bmw-vin-decoder" },
      { label: "BMW Build Sheet Lookup", href: "/bmw-build-sheet-lookup" },
      { label: "BMW SA Codes Guide", href: "/guide/bmw-sa-option-codes-guide" },
    ],
    facetExamples: [
      { label: "SA option S4HA — Heated Steering Wheel", href: "/option/s4ha", description: "See how many decoded BMWs include SA code S4HA (Heated Steering Wheel) — one of the most-searched factory options when buying used." },
      { label: "SA option S430A — Park Distance Control", href: "/option/s430a", description: "Park Distance Control (S430A) appears on a huge range of BMW models. Browse VINs carrying this option and their chassis breakdown." },
      { label: "SA option S302A — Navigation System", href: "/option/s302a", description: "Navigation (S302A) is one of BMW's most common factory options. Explore the decoded cohort that ordered it from the factory." },
    ],
  },
  {
    slug: "bmw-plant-code-lookup",
    toolName: "Plant Code Lookup",
    keyword: "BMW production plant codes",
    h1: "BMW Plant Code Lookup — Find Where Your BMW Was Built",
    quickAnswer: "BMW manufactures vehicles in plants across Germany, the UK, USA, South Africa, China, and other countries. Each plant has a unique code embedded in position 11 of your VIN. Enter your BMW VIN to find exactly where your vehicle was built.",
    shows: [
      "Manufacturing plant name and city",
      "Country of manufacture",
      "Plant code (VIN position 11)",
      "Models produced at each plant",
    ],
    howToSteps: [
      { name: "Locate your VIN", text: "Find the 17-digit VIN on your dashboard or door jamb." },
      { name: "Decode your VIN", text: "Enter the VIN and click Decode to see your plant information." },
      { name: "Find your plant", text: "The manufacturing plant, city, and country display in your decode results." },
    ],
    faqs: [
      { q: "Where are BMW cars manufactured?", a: "BMW has major production plants in Dingolfing (Germany), Munich (Germany), Regensburg (Germany), Leipzig (Germany), Spartanburg (USA/South Carolina), Oxford (UK, MINI), Rosslyn (South Africa), and several joint-venture plants in China." },
      { q: "What is the BMW plant code in the VIN?", a: "Position 11 of the BMW VIN (the 11th character) is the production plant code. For example, '5' indicates Dingolfing (Plant 84), '6' indicates Munich, 'K' indicates Oxford (MINI)." },
      { q: "Which BMW plant builds which models?", a: "Key assignments: Dingolfing (5/6/7/8 Series), Munich (3/4 Series), Regensburg (3/4 Series), Leipzig (i3, i4, 1/2 Series), Spartanburg (X3/X4/X5/X6/X7), Oxford (MINI Hatch, Clubman), Rosslyn (3 Series for Africa/Asia)." },
      { q: "Does the production plant affect BMW quality?", a: "BMW's production standards are consistent across all plants. However, plant-specific options or market configurations may differ." },
      { q: "How does BMW VIN position 11 work?", a: "Position 11 in a BMW VIN is an alphanumeric character representing the assembly plant. BMV.vin automatically decodes this and displays the plant name, city, and country." },
      { q: "Where was my BMW M car built?", a: "Most BMW M vehicles are assembled in Germany. M3/M4 (G80/G82) are built in Regensburg; M5 (G90) in Dingolfing. Some M Sport variants are built at other plants." },
      { q: "Is a Germany-built BMW better than one built elsewhere?", a: "All BMW plants adhere to the same manufacturing standards. The plant of origin is relevant for logistics, not quality — though some buyers have preferences." },
      { q: "Can I verify my BMW's country of origin from the VIN?", a: "Yes — the first character of the VIN is the World Manufacturer Identifier (WMI) country code. 'W' (WBA, WBS) indicates Germany, 'S' indicates UK (for MINI), '5' indicates USA (Spartanburg X models)." },
    ],
    relatedTools: [
      { label: "BMW VIN Decoder", href: "/bmw-vin-decoder" },
      { label: "BMW Production Date Lookup", href: "/bmw-production-date-lookup" },
      { label: "BMW Model Year Lookup", href: "/bmw-model-year-lookup" },
    ],
    facetExamples: [
      { label: "Dingolfing plant builds", href: "/plant/dingolfing", description: "Plant Dingolfing (Germany) is BMW's largest facility, producing the 5, 6, 7 and 8 Series. Browse all decoded VINs assembled there." },
      { label: "Spartanburg plant builds", href: "/plant/spartanburg", description: "BMW's Spartanburg (USA) plant produces the entire X lineup — X3, X4, X5, X6, X7, XM. Explore the full decoded cohort from this plant." },
      { label: "Oxford plant builds", href: "/plant/oxford", description: "The Oxford plant is home to the MINI Hatch, Clubman, and Convertible. Browse VINs and build specs from this iconic UK facility." },
    ],
  },
  {
    slug: "bmw-model-year-lookup",
    toolName: "Model Year Lookup",
    keyword: "BMW model year by VIN",
    h1: "BMW Model Year Lookup — Decode Model Year from VIN",
    quickAnswer: "Your BMW's model year is encoded in position 10 of the 17-character VIN as a single alphanumeric character. Enter your BMW VIN to instantly decode the model year along with all other factory specification data.",
    shows: [
      "Model year (e.g., 2023, 2024)",
      "VIN position 10 character and its year mapping",
      "Production year vs model year distinction",
      "Body type and generation for the model year",
    ],
    howToSteps: [
      { name: "Find your VIN", text: "Locate your 17-digit BMW VIN on the dashboard, door jamb, or registration." },
      { name: "Enter and decode", text: "Paste the VIN and click Decode to see model year and full vehicle specification." },
      { name: "Read your model year", text: "The model year and its VIN position 10 character display in your results." },
    ],
    faqs: [
      { q: "How do I find the model year of my BMW from the VIN?", a: "The model year is encoded in position 10 of the 17-character VIN. The character cycles through letters (skipping I, O, Q, U, Z) and numbers. 'N' = 2022, 'P' = 2023, 'R' = 2024, 'S' = 2025, 'T' = 2026." },
      { q: "Is BMW model year the same as production year?", a: "Not always. A vehicle produced in late 2022 may be sold as a 2023 model year. BMW model years typically begin in August/September of the prior calendar year." },
      { q: "What is VIN position 10?", a: "Position 10 of a VIN (the 10th character) universally encodes the model year across all manufacturers including BMW. Each character represents a specific year in a repeating 30-year cycle." },
      { q: "Why does my BMW's model year not match the registration year?", a: "Model year precedes registration in most cases. A 2023 model year BMW may have been registered in 2022 (if produced/delivered early) or 2023/2024 for demo/unsold stock." },
      { q: "How do I look up BMW model year by the VIN character?", a: "The BMV.vin decoder automatically interprets position 10 and displays the model year as a four-digit number. You can also cross-reference: A=1980, B=1981...Y=2000, 1=2001...9=2009, A=2010...Y=2030." },
      { q: "Does model year affect BMW part numbers?", a: "Yes. BMW parts are often superseded or revised at model year transitions. Knowing your exact model year (and production date) ensures you order the correct part variant." },
      { q: "Can I find out the exact week my BMW was produced?", a: "The VIN does not encode week of production — only year. Production month comes from BMW's factory records, retrievable via BMV.vin for most models." },
      { q: "Is BMW G20 the same across all model years?", a: "The G20 3 Series had a production run from 2018 to 2025+. There are significant differences between pre-LCI and LCI (facelift) variants, separable by production date and model year." },
    ],
    relatedTools: [
      { label: "BMW VIN Decoder", href: "/bmw-vin-decoder" },
      { label: "BMW Production Date Lookup", href: "/bmw-production-date-lookup" },
      { label: "BMW Plant Code Lookup", href: "/bmw-plant-code-lookup" },
    ],
    facetExamples: [
      { label: "Model year 2023 builds", href: "/year/2023", description: "Explore decoded BMW Group VINs from model year 2023 — includes the facelifted G20 LCI 3 Series and the new G60 5 Series generation." },
      { label: "Model year 2022 builds", href: "/year/2022", description: "Browse the full cohort of model year 2022 builds: G80/G82 M3/M4, G05 X5, G30 5 Series and more — with their production dates and SA codes." },
      { label: "Model year 2020 builds", href: "/year/2020", description: "Model year 2020 spans the first full year of the G20 3 Series. Browse production dates, plants, and factory options for this cohort." },
    ],
  },
];

// ---------------------------------------------------------------------------
// Template A SSR builder
// ---------------------------------------------------------------------------

function buildVinInput(placeholder = "Enter 17-digit BMW VIN"): string {
  return `
<div class="vin-tool-form" style="margin:1.5rem 0;padding:1.25rem;background:hsl(var(--muted));border-radius:0.5rem;border:1px solid hsl(var(--border))">
  <form id="vin-decode-form" onsubmit="return false" style="display:flex;flex-wrap:wrap;gap:0.75rem;align-items:center">
    <input
      id="vin-tool-input"
      type="text"
      placeholder="${escAttr(placeholder)}"
      maxlength="17"
      autocapitalize="characters"
      autocorrect="off"
      spellcheck="false"
      style="font-family:monospace;text-transform:uppercase;padding:0.5rem 0.75rem;border:1px solid hsl(var(--border));border-radius:0.375rem;flex:1;min-width:200px;max-width:340px;font-size:0.875rem"
      data-testid="input-vin-tool"
    />
    <button
      type="button"
      onclick="(function(){var v=document.getElementById('vin-tool-input').value.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,'');if(v.length===17){window.location.href='/'+v;}else{alert('Please enter a valid 17-character BMW VIN');}})();"
      style="padding:0.5rem 1.25rem;background:hsl(var(--primary));color:hsl(var(--primary-foreground));border:none;border-radius:0.375rem;cursor:pointer;font-weight:500;font-size:0.875rem"
      data-testid="button-decode-tool"
    >Decode VIN →</button>
  </form>
</div>`.trim();
}

export function buildVinToolSeo(slug: string): VinHostSeoBundle | null {
  const tool = VIN_TOOLS.find(t => t.slug === slug);
  if (!tool) return null;

  const canonicalUrl = `${BMV_VIN_BASE}/${tool.slug}`;
  const title = `${tool.keyword.replace(/\b\w/g, c => c.toUpperCase())} — Free, Instant & Accurate | ${SITE_NAME}`;
  const description = `${tool.quickAnswer.substring(0, 155).trim()}`;

  const jsonLd: unknown[] = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": `BMW ${tool.toolName} | BMV.vin`,
      "url": canonicalUrl,
      "applicationCategory": "AutomotiveApplication",
      "operatingSystem": "Any",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
      "description": description,
    },
    faqJsonLd(tool.faqs),
    breadcrumbJsonLd([
      { name: "BMV.VIN", url: BMV_VIN_BASE },
      { name: `BMW ${tool.toolName}`, url: canonicalUrl },
    ]),
  ];

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": `How to use the BMW ${tool.toolName}`,
    "step": tool.howToSteps.map((s, i) => ({
      "@type": "HowToStep",
      "position": i + 1,
      "name": s.name,
      "text": s.text,
    })),
  };
  jsonLd.push(howToSchema);

  const headFragment = buildHead({ title, description, canonicalUrl, jsonLd });

  // Spoke tool links for the hub page
  const spokeLinks = tool.relatedTools.map(t =>
    `<li><a href="${escAttr(t.href)}">${esc(t.label)}</a></li>`
  ).join("");

  const showsList = tool.shows.map(s => `<li>${esc(s)}</li>`).join("");
  const howToHtml = tool.howToSteps.map((s, i) =>
    `<li><strong>${esc(s.name)}</strong> — ${esc(s.text)}</li>`
  ).join("");
  const faqHtml = tool.faqs.map(f =>
    `<details style="margin-bottom:0.75rem;border:1px solid hsl(var(--border));border-radius:0.5rem;padding:0.75rem">
      <summary style="cursor:pointer;font-weight:500">${esc(f.q)}</summary>
      <p style="margin-top:0.5rem;color:hsl(var(--muted-foreground))">${esc(f.a)}</p>
    </details>`
  ).join("");

  const rootBody = `
<div style="max-width:860px;margin:0 auto;padding:1.5rem 1rem" data-testid="page-vin-tool-${slug}">
  <nav style="font-size:0.75rem;color:hsl(var(--muted-foreground));margin-bottom:0.75rem">
    <a href="/">BMV.VIN</a> › <span>BMW ${esc(tool.toolName)}</span>
  </nav>

  <h1 style="font-size:1.75rem;font-weight:700;margin-bottom:0.5rem">${esc(tool.h1)}</h1>

  <div style="background:hsl(var(--muted));border-left:4px solid hsl(var(--primary));padding:1rem 1.25rem;border-radius:0 0.5rem 0.5rem 0;margin-bottom:1.5rem">
    <p style="margin:0;font-size:0.9375rem"><strong>Quick Answer:</strong> ${esc(tool.quickAnswer)}</p>
  </div>

  ${buildVinInput(`Enter your 17-digit BMW VIN to ${tool.toolName === "VIN Decoder" ? "decode it" : `find your ${tool.toolName.toLowerCase()}`}`)}

  <h2 style="font-size:1.25rem;font-weight:600;margin:1.5rem 0 0.75rem">What this tool shows</h2>
  <ul style="padding-left:1.5rem;line-height:1.8">${showsList}</ul>

  <h2 style="font-size:1.25rem;font-weight:600;margin:1.5rem 0 0.75rem">How to use</h2>
  <ol style="padding-left:1.5rem;line-height:1.8">${howToHtml}</ol>

  <h2 style="font-size:1.25rem;font-weight:600;margin:1.5rem 0 0.75rem">Where to find your BMW VIN</h2>
  <p>Your BMW VIN can be found in four locations:</p>
  <ul style="padding-left:1.5rem;line-height:1.8">
    <li><strong>Dashboard</strong> — visible through the windscreen on the driver's side</li>
    <li><strong>Driver's door jamb</strong> — on the label sticker inside the door frame</li>
    <li><strong>Vehicle registration documents</strong> — printed on the certificate of registration</li>
    <li><strong>Engine bay</strong> — stamped on the firewall or chassis rail</li>
  </ul>

  <h2 style="font-size:1.25rem;font-weight:600;margin:1.5rem 0 0.75rem">Frequently Asked Questions</h2>
  ${faqHtml}

  <h2 style="font-size:1.25rem;font-weight:600;margin:1.5rem 0 0.75rem">Related BMW VIN Tools</h2>
  <ul style="padding-left:1.5rem;line-height:1.8">${spokeLinks}</ul>

  ${tool.facetExamples && tool.facetExamples.length > 0 ? `
  <h2 style="font-size:1.25rem;font-weight:600;margin:1.5rem 0 0.75rem">Explore Real BMW VIN Data</h2>
  <p style="color:hsl(var(--muted-foreground));margin-bottom:1rem;font-size:0.9375rem">Browse real decoded BMW VINs grouped by the data point this tool surfaces — chassis, paint, plant, year, or SA options.</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem;margin-bottom:1.5rem">
    ${tool.facetExamples.map(ex => `
    <a href="${escAttr(ex.href)}" style="display:block;padding:1rem;border:1px solid hsl(var(--border));border-radius:0.5rem;text-decoration:none;color:inherit;transition:border-color 0.15s" data-testid="link-facet-example">
      <strong style="color:hsl(var(--primary));font-size:0.9375rem">${esc(ex.label)}</strong>
      <p style="margin:0.25rem 0 0;font-size:0.8125rem;color:hsl(var(--muted-foreground));line-height:1.4">${esc(ex.description)}</p>
    </a>`).join("")}
  </div>` : ""}

  <div style="margin-top:2rem;padding:1rem;border:1px solid hsl(var(--border));border-radius:0.5rem;background:hsl(var(--muted))">
    <p style="margin:0;font-size:0.875rem">
      <strong>Find parts for your BMW →</strong>
      <a href="${escAttr(BMV_PARTS_BASE)}" target="_blank" rel="noopener" style="color:hsl(var(--primary));margin-left:0.5rem">
        Search 6 million+ genuine BMW parts on BMV.parts
      </a>
    </p>
  </div>
</div>`.trim();

  return { status: 200, title, description, canonicalUrl, headFragment, rootBody, noindex: false };
}

// ---------------------------------------------------------------------------
// Template B — Model-specific VIN pages
// ---------------------------------------------------------------------------

export async function buildModelVinSeo(chassis: string): Promise<VinHostSeoBundle | null> {
  // Verify chassis exists in database
  const result = await db.execute(sql`
    SELECT UPPER(chassis) AS chassis, MIN(year_start) AS year_start, MAX(COALESCE(year_end, year_start)) AS year_end,
           STRING_AGG(DISTINCT display_name, ', ' ORDER BY display_name) AS models
    FROM cars
    WHERE UPPER(chassis) = UPPER(${chassis})
    GROUP BY UPPER(chassis)
    LIMIT 1
  `);
  const row = (result.rows as { chassis: string; year_start: number | null; year_end: number | null; models: string }[])[0];

  // Unknown chassis — return null so the SSR middleware emits a proper noindex
  // 404 instead of creating unbounded indexable garbage URLs like /bmw-anything-vin-decoder.
  if (!row) return null;

  const chassisUpper = chassis.toUpperCase();
  const slug = `bmw-${chassis.toLowerCase()}-vin-decoder`;
  const canonicalUrl = `${BMV_VIN_BASE}/${slug}`;

  const yearRange = row?.year_start
    ? (row.year_end && row.year_end !== row.year_start ? `${row.year_start}–${row.year_end}` : `${row.year_start}+`)
    : "";
  const modelsStr = row?.models ?? chassisUpper;

  const h1 = `BMW ${chassisUpper} VIN Decoder — Free ${chassisUpper} VIN Lookup`;
  const title = `BMW ${chassisUpper} VIN Decoder — Free BMW ${chassisUpper} VIN Lookup | ${SITE_NAME}`;
  const description = `Decode any BMW ${chassisUpper} VIN for free. Get build sheet, factory options, paint code, production date, and more. ${yearRange ? `${chassisUpper}: ${yearRange}. ` : ""}Instant, accurate, no registration.`;

  const quickAnswer = `Enter any BMW ${chassisUpper} VIN into the decoder below to instantly retrieve your vehicle's complete factory specification — including all SA option codes, original paint code, production date, manufacturing plant, and engine code. Free, no registration required.`;

  const bmwPartsChassis = `${BMV_PARTS_BASE}/chassis/${chassisUpper.toLowerCase()}`;

  const faqs = [
    { q: `What is the BMW ${chassisUpper} chassis?`, a: `The BMW ${chassisUpper} is the internal development code for a specific BMW model generation. ${yearRange ? `The ${chassisUpper} was produced from ${yearRange}. ` : ""}It is used internally to identify vehicles of the same platform, differentiating between generations of the same model line.` },
    { q: `How do I decode a BMW ${chassisUpper} VIN?`, a: `Enter your 17-digit BMW ${chassisUpper} VIN into the BMV.vin decoder above. Your complete build sheet, factory options, paint code, production date, and engine specifications will display instantly.` },
    { q: `What data is available for BMW ${chassisUpper} VINs?`, a: `For most BMW ${chassisUpper} models, BMV.vin can retrieve: SA option codes (factory options), original paint code, upholstery code, production date and plant, engine code, transmission type, and market specification.` },
    { q: `Where can I find the VIN on a BMW ${chassisUpper}?`, a: `The VIN on a BMW ${chassisUpper} is located on the dashboard (visible through the windscreen on the driver's side), on the door jamb label inside the driver's door, and in the registration certificate.` },
    { q: `What parts are specific to the BMW ${chassisUpper}?`, a: `The ${chassisUpper} chassis has its own set of OEM parts. Use BMV.parts to browse the complete parts catalogue for BMW ${chassisUpper} — linked at the bottom of this page.` },
    { q: `Does BMV.vin support all BMW ${chassisUpper} variants?`, a: `Yes — BMV.vin supports all ${chassisUpper} variants including different engines, body styles, and market specifications. Enter your specific VIN to decode your exact vehicle configuration.` },
  ];

  const jsonLd: unknown[] = [
    {
      "@context": "https://schema.org",
      "@type": "Vehicle",
      "name": `BMW ${chassisUpper}`,
      "vehicleModelDate": yearRange || undefined,
      "manufacturer": { "@type": "Organization", "name": "BMW" },
    },
    faqJsonLd(faqs),
    breadcrumbJsonLd([
      { name: "BMV.VIN", url: BMV_VIN_BASE },
      { name: "BMW VIN Decoder", url: `${BMV_VIN_BASE}/bmw-vin-decoder` },
      { name: `BMW ${chassisUpper}`, url: canonicalUrl },
    ]),
  ];

  const headFragment = buildHead({ title, description, canonicalUrl, jsonLd });

  const faqHtml = faqs.map(f =>
    `<details style="margin-bottom:0.75rem;border:1px solid hsl(var(--border));border-radius:0.5rem;padding:0.75rem">
      <summary style="cursor:pointer;font-weight:500">${esc(f.q)}</summary>
      <p style="margin-top:0.5rem;color:hsl(var(--muted-foreground))">${esc(f.a)}</p>
    </details>`
  ).join("");

  const rootBody = `
<div style="max-width:860px;margin:0 auto;padding:1.5rem 1rem" data-testid="page-model-vin-${chassis.toLowerCase()}">
  <nav style="font-size:0.75rem;color:hsl(var(--muted-foreground));margin-bottom:0.75rem">
    <a href="/">BMV.VIN</a> › <a href="/bmw-vin-decoder">BMW VIN Decoder</a> › <span>BMW ${esc(chassisUpper)}</span>
  </nav>

  <h1 style="font-size:1.75rem;font-weight:700;margin-bottom:0.5rem">${esc(h1)}</h1>
  ${yearRange ? `<p style="color:hsl(var(--muted-foreground));margin-bottom:0.5rem">Production: ${esc(yearRange)} | Models: ${esc(modelsStr)}</p>` : ""}

  <div style="background:hsl(var(--muted));border-left:4px solid hsl(var(--primary));padding:1rem 1.25rem;border-radius:0 0.5rem 0.5rem 0;margin-bottom:1.5rem">
    <p style="margin:0;font-size:0.9375rem"><strong>Quick Answer:</strong> ${esc(quickAnswer)}</p>
  </div>

  ${buildVinInput(`Enter your BMW ${chassisUpper} VIN (17 characters)`)}

  <h2 style="font-size:1.25rem;font-weight:600;margin:1.5rem 0 0.75rem">About the BMW ${esc(chassisUpper)}</h2>
  <p>The BMW ${esc(chassisUpper)} is an internally-designated chassis code representing a specific generation of BMW vehicle. ${yearRange ? `Produced ${esc(yearRange)}, the ${esc(chassisUpper)} includes: ${esc(modelsStr)}.` : ""} Each ${esc(chassisUpper)} carries a unique 17-digit VIN that encodes its complete factory specification.</p>

  <h2 style="font-size:1.25rem;font-weight:600;margin:1.5rem 0 0.75rem">Data available for ${esc(chassisUpper)} VINs</h2>
  <ul style="padding-left:1.5rem;line-height:1.8">
    <li>Complete factory build sheet (SA option codes)</li>
    <li>Original paint code and colour name</li>
    <li>Production date and manufacturing plant</li>
    <li>Engine code and transmission type</li>
    <li>Market specification and body type</li>
  </ul>

  <h2 style="font-size:1.25rem;font-weight:600;margin:1.5rem 0 0.75rem">Frequently Asked Questions</h2>
  ${faqHtml}

  <div style="margin-top:2rem;display:flex;flex-wrap:wrap;gap:1rem">
    <a href="${escAttr(bmwPartsChassis)}" target="_blank" rel="noopener"
      style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.75rem 1.25rem;background:hsl(var(--primary));color:hsl(var(--primary-foreground));border-radius:0.5rem;text-decoration:none;font-weight:500;font-size:0.875rem">
      Find BMW ${esc(chassisUpper)} Parts on BMV.parts →
    </a>
    <a href="/bmw-vin-decoder"
      style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.75rem 1.25rem;border:1px solid hsl(var(--border));border-radius:0.5rem;text-decoration:none;font-weight:500;font-size:0.875rem">
      ← BMW VIN Decoder Hub
    </a>
  </div>
</div>`.trim();

  return { status: 200, title, description, canonicalUrl, headFragment, rootBody, noindex: false };
}

// ---------------------------------------------------------------------------
// Template E — Comparison pages
// ---------------------------------------------------------------------------

interface ComparisonDef {
  slug: string;
  h1: string;
  description: string;
  quickAnswer: string;
  winnerSummary: string;
  table: { feature: string; bmvVin: string; competitor: string }[];
  faqs: { q: string; a: string }[];
  competitor?: string;
}

const COMPARISONS: ComparisonDef[] = [
  {
    slug: "best-bmw-vin-decoders",
    h1: "Best BMW VIN Decoders Compared (2026)",
    description: "Comparing the best BMW VIN decoders in 2026: BMV.vin, VINDecoderZ, MDEcoder, AutoCheck, and Bimmer.work. Find the most accurate free BMW VIN decoder.",
    quickAnswer: "BMV.vin is the best free BMW VIN decoder for 2026, offering real BMW factory data including SA option codes, paint codes, production dates, and plant information — not just generic VIN database results. It is the only tool that combines BMW-specific accuracy with rich SEO content, model/chassis pages, and a completely free tool with no registration.",
    winnerSummary: "BMV.vin wins for BMW-specific accuracy, depth of factory data (SA codes, paint, production date), and being completely free.",
    table: [
      { feature: "BMW-specific factory data", bmvVin: "✅ Real BMW factory records", competitor: "❌ Generic VIN database" },
      { feature: "SA option codes", bmvVin: "✅ Full SA code list", competitor: "❌ Not available" },
      { feature: "Paint code by VIN", bmvVin: "✅ Factory colour code", competitor: "⚠️ Limited" },
      { feature: "Production date", bmvVin: "✅ Month & year", competitor: "⚠️ Year only" },
      { feature: "Manufacturing plant", bmvVin: "✅ Plant name & city", competitor: "⚠️ Code only" },
      { feature: "Price", bmvVin: "✅ Free, no registration", competitor: "⚠️ Paid or limited free" },
      { feature: "MINI / ALPINA / Rolls-Royce", bmvVin: "✅ All BMW Group brands", competitor: "❌ BMW only or generic" },
    ],
    faqs: [
      { q: "Which is the best free BMW VIN decoder?", a: "BMV.vin is the best free BMW VIN decoder in 2026. It uses real BMW factory data to decode SA option codes, paint codes, production dates, and manufacturing plant — all for free with no registration required." },
      { q: "Is VINDecoderZ accurate for BMW?", a: "VINDecoderZ provides generic VIN database results and is not BMW-specific. It typically returns basic model information but lacks SA option codes, paint codes, and factory-accurate production data." },
      { q: "What does MDEcoder offer?", a: "MDEcoder is a paid BMW VIN decoder. It offers some BMW-specific data but requires a subscription. BMV.vin provides comparable or better data for free." },
      { q: "Can I use AutoCheck for BMW VIN decoding?", a: "AutoCheck is a vehicle history report service, not a factory data decoder. It can reveal accident and ownership history but does not decode BMW SA codes, paint codes, or production plant data." },
      { q: "Is Bimmer.work a good BMW VIN decoder?", a: "Bimmer.work provides some BMW VIN data but has limitations in coverage and does not have a rich SEO content layer or model-specific landing pages." },
    ],
  },
  {
    slug: "bmv-vin-vs-vindecoderz",
    h1: "BMV.vin vs VINDecoderZ — Which is More Accurate for BMW?",
    description: "A detailed comparison of BMV.vin and VINDecoderZ for BMW VIN decoding. Find out which provides more accurate, BMW-specific data.",
    quickAnswer: "BMV.vin is significantly more accurate for BMW VIN decoding than VINDecoderZ. BMV.vin uses real BMW factory data to decode SA option codes, original paint codes, production dates, and manufacturing plant information. VINDecoderZ relies on a generic VIN database and cannot decode BMW-specific factory specifications.",
    winnerSummary: "BMV.vin wins for BMW vehicles — it uses actual BMW factory data instead of a generic VIN database.",
    competitor: "VINDecoderZ",
    table: [
      { feature: "Data source", bmvVin: "BMW factory records + ETK catalog", competitor: "Generic VIN database" },
      { feature: "SA option codes", bmvVin: "✅ Full list with descriptions", competitor: "❌ Not available" },
      { feature: "Paint code", bmvVin: "✅ Factory colour code + name", competitor: "❌ Not available" },
      { feature: "Production date", bmvVin: "✅ Month and year", competitor: "⚠️ Approximate year only" },
      { feature: "Manufacturing plant", bmvVin: "✅ Plant name, city, country", competitor: "❌ Not available" },
      { feature: "BMW Group coverage", bmvVin: "BMW, MINI, ALPINA, Rolls-Royce, Motorrad", competitor: "BMW only (limited)" },
      { feature: "Cost", bmvVin: "Free", competitor: "Free (limited)" },
    ],
    faqs: [
      { q: "Is BMV.vin better than VINDecoderZ for BMW?", a: "Yes, for BMW vehicles specifically. BMV.vin uses real BMW factory records to decode SA option codes, paint codes, production dates, and plant information. VINDecoderZ uses a generic VIN database and cannot provide BMW-specific factory data." },
      { q: "Does VINDecoderZ show BMW SA codes?", a: "No. SA codes (Sonderausstattung — BMW's factory option codes) are specific to BMW's factory ordering system and are not available in generic VIN databases like VINDecoderZ." },
      { q: "Which is faster — BMV.vin or VINDecoderZ?", a: "Both provide near-instant results for basic VIN decoding. BMV.vin retrieves additional BMW factory data which may take 1-2 seconds longer for fresh lookups." },
      { q: "Can VINDecoderZ find BMW paint codes?", a: "No. VINDecoderZ does not decode BMW paint codes. BMV.vin retrieves the factory paint code (e.g., 475 = Black Sapphire Metallic) from BMW's factory database." },
    ],
  },
  {
    slug: "free-vs-paid-bmw-vin-check",
    h1: "Free vs Paid BMW VIN Check — Is It Worth Paying?",
    description: "Should you pay for a BMW VIN check? Comparing free tools (BMV.vin) against paid services (MDEcoder, AutoCheck, Carfax). Find out what you actually need.",
    quickAnswer: "For BMW factory data (build sheet, SA codes, paint code, production date), a free tool like BMV.vin is the best option — it uses real BMW factory records at no cost. For vehicle history (accident records, previous owners, mileage verification), a paid Carvertical check is recommended for used car buyers.",
    winnerSummary: "Use BMV.vin (free) for factory data, Carvertical (paid) for history — you rarely need both in one tool.",
    competitor: "Paid VIN services",
    table: [
      { feature: "Factory build sheet / SA codes", bmvVin: "✅ Free", competitor: "⚠️ Limited or paid" },
      { feature: "Paint code", bmvVin: "✅ Free", competitor: "⚠️ Limited or paid" },
      { feature: "Production date", bmvVin: "✅ Free", competitor: "⚠️ Paid" },
      { feature: "Accident history", bmvVin: "❌ Not available", competitor: "✅ Paid (Carvertical, Carfax)" },
      { feature: "Mileage history", bmvVin: "❌ Not available", competitor: "✅ Paid (Carvertical)" },
      { feature: "Previous owners", bmvVin: "❌ Not available", competitor: "✅ Paid" },
      { feature: "Stolen vehicle check", bmvVin: "❌ Not available", competitor: "✅ Paid" },
    ],
    faqs: [
      { q: "Do I need to pay for a BMW VIN check?", a: "It depends on what you need. For factory spec data (build sheet, options, paint code, production date), BMV.vin is free and uses real BMW data. For vehicle history (accidents, mileage, stolen check), a paid service like Carvertical is necessary." },
      { q: "What does a free BMW VIN check tell you?", a: "A free BMW VIN check on BMV.vin reveals the complete factory specification: SA option codes, paint code, production date, manufacturing plant, engine, and VIN structure breakdown." },
      { q: "What does a paid BMW VIN check add?", a: "Paid checks add vehicle history data: accident records, insurance write-offs, odometer readings, previous ownership, and stolen vehicle flags. This information comes from insurance companies, repair networks, and government databases." },
      { q: "Is Carvertical worth it for BMW?", a: "Carvertical is recommended for pre-purchase checks on used BMWs. It provides mileage history, accident data, and country history for vehicles across Europe and beyond. Use code BMV for a discount." },
    ],
  },
];

export function buildComparisonSeo(slug: string): VinHostSeoBundle | null {
  const comp = COMPARISONS.find(c => c.slug === slug);
  if (!comp) return null;

  const canonicalUrl = `${BMV_VIN_BASE}/compare/${slug}`;
  const title = `${comp.h1} | ${SITE_NAME}`;

  const jsonLd: unknown[] = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": comp.h1,
      "description": comp.description,
      "author": { "@type": "Organization", "name": "BMV.VIN" },
      "publisher": { "@type": "Organization", "name": "BMV.VIN", "url": BMV_VIN_BASE },
      "dateModified": new Date().toISOString().split("T")[0],
    },
    faqJsonLd(comp.faqs),
    breadcrumbJsonLd([
      { name: "BMV.VIN", url: BMV_VIN_BASE },
      { name: "Comparisons", url: `${BMV_VIN_BASE}/compare` },
      { name: comp.h1, url: canonicalUrl },
    ]),
  ];

  const headFragment = buildHead({ title, description: comp.description, canonicalUrl, jsonLd, ogType: "article" });

  const tableRows = comp.table.map(row =>
    `<tr>
      <td style="padding:0.5rem;border:1px solid hsl(var(--border));font-weight:500">${esc(row.feature)}</td>
      <td style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:center">${esc(row.bmvVin)}</td>
      <td style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:center">${esc(row.competitor)}</td>
    </tr>`
  ).join("");

  const faqHtml = comp.faqs.map(f =>
    `<details style="margin-bottom:0.75rem;border:1px solid hsl(var(--border));border-radius:0.5rem;padding:0.75rem">
      <summary style="cursor:pointer;font-weight:500">${esc(f.q)}</summary>
      <p style="margin-top:0.5rem">${esc(f.a)}</p>
    </details>`
  ).join("");

  const rootBody = `
<div style="max-width:860px;margin:0 auto;padding:1.5rem 1rem" data-testid="page-compare-${slug}">
  <nav style="font-size:0.75rem;color:hsl(var(--muted-foreground));margin-bottom:0.75rem">
    <a href="/">BMV.VIN</a> › <span>Comparison</span>
  </nav>
  <h1 style="font-size:1.75rem;font-weight:700;margin-bottom:0.5rem">${esc(comp.h1)}</h1>

  <div style="background:hsl(var(--muted));border-left:4px solid hsl(var(--primary));padding:1rem 1.25rem;border-radius:0 0.5rem 0.5rem 0;margin-bottom:1.5rem">
    <p style="margin:0;font-size:0.9375rem"><strong>Quick Answer:</strong> ${esc(comp.quickAnswer)}</p>
  </div>

  <div style="background:#f0fdf4;border:1px solid #86efac;padding:0.75rem 1rem;border-radius:0.5rem;margin-bottom:1.5rem;font-weight:500">
    ✅ Verdict: ${esc(comp.winnerSummary)}
  </div>

  <h2 style="font-size:1.25rem;font-weight:600;margin:1.5rem 0 0.75rem">Feature Comparison</h2>
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:0.875rem">
      <thead>
        <tr style="background:hsl(var(--muted))">
          <th style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:left">Feature</th>
          <th style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:center">BMV.vin</th>
          <th style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:center">${esc(comp.competitor ?? "Competitor")}</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <h2 style="font-size:1.25rem;font-weight:600;margin:1.5rem 0 0.75rem">Try BMW VIN Decoder Free</h2>
  ${buildVinInput()}

  <h2 style="font-size:1.25rem;font-weight:600;margin:1.5rem 0 0.75rem">Frequently Asked Questions</h2>
  ${faqHtml}

  <div style="margin-top:2rem;padding:1rem;border:1px solid hsl(var(--border));border-radius:0.5rem;background:hsl(var(--muted))">
    <p style="margin:0;font-size:0.875rem">
      <strong>Also buying a used BMW?</strong> Use
      <a href="${CARVERTICAL_LINK}" target="_blank" rel="noopener sponsored" style="color:hsl(var(--primary))">Carvertical</a>
      to check mileage history and accident records. Use code <strong>BMV</strong> for a discount.
    </p>
  </div>
</div>`.trim();

  return { status: 200, title, description: comp.description, canonicalUrl, headFragment, rootBody, noindex: false };
}

// ---------------------------------------------------------------------------
// Template F — Statistics pages
// ---------------------------------------------------------------------------

interface StatDef {
  slug: string;
  h1: string;
  description: string;
  quickAnswer: string;
}

const STAT_PAGES: StatDef[] = [
  {
    slug: "most-popular-bmw-options",
    h1: "Most Popular BMW Factory Options (Live Data from BMV.vin)",
    description: "Which BMW factory options are most commonly ordered? Live statistics from BMW VIN decode data on BMV.vin showing the most popular SA codes by frequency.",
    quickAnswer: "The most popular BMW factory options — ranked by frequency in our VIN decode database — include Sport/M Sport packages, Park Distance Control, Navigation Professional, and Comfort Access. Data is derived from real BMW factory build sheets decoded on BMV.vin.",
  },
  {
    slug: "most-common-bmw-paint-colours",
    h1: "Most Common BMW Paint Colours (by Model, from VIN Data)",
    description: "Which BMW paint colours are most popular? Live data from real BMW factory build sheets decoded on BMV.vin showing the most common colour codes by frequency.",
    quickAnswer: "Black Sapphire Metallic (475), Mineral White (300), and Alpine White (300) are consistently the most popular BMW paint colours across all models. Data sourced from real BMW factory records decoded through BMV.vin.",
  },
  {
    slug: "bmw-production-plant-stats",
    h1: "BMW Production Plant Statistics — Where BMWs Are Built",
    description: "BMW production plant distribution data from VIN decode records on BMV.vin. See which BMW plants produce the most vehicles decoded on our platform.",
    quickAnswer: "Dingolfing (Plant 84) is BMW's largest plant and produces 5/7/8 Series vehicles. Spartanburg produces all X3/X5/X6/X7 models exported to most markets. Data from real BMW VIN records decoded on BMV.vin.",
  },
  {
    slug: "most-decoded-bmw-chassis",
    h1: "Most Decoded BMW Chassis Codes on BMV.vin",
    description: "Which BMW chassis codes are most frequently decoded on BMV.vin? Live rankings from our VIN decode database showing the most searched BMW models.",
    quickAnswer: "The most frequently decoded BMW chassis codes on BMV.vin are consistently from the most popular BMW model lines — typically including G20 (3 Series), F30 (3 Series), G05 (X5), and G80 (M3). Data updated in real-time from our VIN decode database.",
  },
];

type ChassisCountRow = { chassis: string; count: number };
type OptionCountRow = { code: string; count: number };
type PaintCountRow = { code: string; count: number };
type PlantCountRow = { plant: string; count: number };

export async function buildStatisticsSeo(slug: string): Promise<VinHostSeoBundle | null> {
  const def = STAT_PAGES.find(d => d.slug === slug);
  if (!def) return null;

  const canonicalUrl = `${BMV_VIN_BASE}/data/${slug}`;
  const title = `${def.h1} | ${SITE_NAME}`;

  let tableHtml = "";
  let dataHtml = "";

  try {
    if (slug === "most-popular-bmw-options") {
      const rs = await db.execute(sql`
        SELECT opt->>'code' AS code, COUNT(*)::int AS count
        FROM vin_cache,
             jsonb_array_elements(COALESCE(enriched_data->'options', '[]'::jsonb)) AS opt
        WHERE opt->>'code' IS NOT NULL AND opt->>'code' <> ''
        GROUP BY code ORDER BY count DESC LIMIT 25
      `);
      const rows = rs.rows as OptionCountRow[];
      if (rows.length > 0) {
        const tableRows = rows.map((r, i) =>
          `<tr>
            <td style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:center">${i + 1}</td>
            <td style="padding:0.5rem;border:1px solid hsl(var(--border));font-family:monospace">${esc(r.code)}</td>
            <td style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:right">${r.count.toLocaleString()}</td>
          </tr>`
        ).join("");
        tableHtml = `<table style="width:100%;border-collapse:collapse;font-size:0.875rem">
          <thead><tr style="background:hsl(var(--muted))">
            <th style="padding:0.5rem;border:1px solid hsl(var(--border))">#</th>
            <th style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:left">SA Code</th>
            <th style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:right">VINs with this option</th>
          </tr></thead><tbody>${tableRows}</tbody></table>`;
      }
    } else if (slug === "most-common-bmw-paint-colours") {
      const rs = await db.execute(sql`
        SELECT enriched_data->'vehicle'->>'colorCode' AS code, COUNT(*)::int AS count
        FROM vin_cache
        WHERE enriched_data->'vehicle'->>'colorCode' IS NOT NULL
          AND enriched_data->'vehicle'->>'colorCode' <> ''
        GROUP BY code ORDER BY count DESC LIMIT 20
      `);
      const rows = rs.rows as PaintCountRow[];
      if (rows.length > 0) {
        const tableRows = rows.map((r, i) =>
          `<tr>
            <td style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:center">${i + 1}</td>
            <td style="padding:0.5rem;border:1px solid hsl(var(--border));font-family:monospace">${esc(r.code)}</td>
            <td style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:right">${r.count.toLocaleString()}</td>
          </tr>`
        ).join("");
        tableHtml = `<table style="width:100%;border-collapse:collapse;font-size:0.875rem">
          <thead><tr style="background:hsl(var(--muted))">
            <th style="padding:0.5rem;border:1px solid hsl(var(--border))">#</th>
            <th style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:left">Paint Code</th>
            <th style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:right">VINs with this colour</th>
          </tr></thead><tbody>${tableRows}</tbody></table>`;
      }
    } else if (slug === "bmw-production-plant-stats") {
      const rs = await db.execute(sql`
        SELECT decoded_data->'plant'->>'city' AS plant, COUNT(*)::int AS count
        FROM vin_cache
        WHERE decoded_data->'plant'->>'city' IS NOT NULL
          AND decoded_data->'plant'->>'city' <> ''
        GROUP BY plant ORDER BY count DESC LIMIT 20
      `);
      const rows = rs.rows as PlantCountRow[];
      if (rows.length > 0) {
        const tableRows = rows.map((r, i) =>
          `<tr>
            <td style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:center">${i + 1}</td>
            <td style="padding:0.5rem;border:1px solid hsl(var(--border))">${esc(r.plant)}</td>
            <td style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:right">${r.count.toLocaleString()}</td>
          </tr>`
        ).join("");
        tableHtml = `<table style="width:100%;border-collapse:collapse;font-size:0.875rem">
          <thead><tr style="background:hsl(var(--muted))">
            <th style="padding:0.5rem;border:1px solid hsl(var(--border))">#</th>
            <th style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:left">Plant / City</th>
            <th style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:right">VINs decoded</th>
          </tr></thead><tbody>${tableRows}</tbody></table>`;
      }
    } else if (slug === "most-decoded-bmw-chassis") {
      const rs = await db.execute(sql`
        SELECT decoded_data->>'chassis' AS chassis, COUNT(*)::int AS count
        FROM vin_cache
        WHERE decoded_data->>'chassis' IS NOT NULL AND decoded_data->>'chassis' <> ''
        GROUP BY chassis ORDER BY count DESC LIMIT 25
      `);
      const rows = rs.rows as ChassisCountRow[];
      if (rows.length > 0) {
        const tableRows = rows.map((r, i) =>
          `<tr>
            <td style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:center">${i + 1}</td>
            <td style="padding:0.5rem;border:1px solid hsl(var(--border));font-family:monospace">
              <a href="/bmw-${esc(r.chassis.toLowerCase())}-vin-decoder" style="color:hsl(var(--primary))">${esc(r.chassis)}</a>
            </td>
            <td style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:right">${r.count.toLocaleString()}</td>
          </tr>`
        ).join("");
        tableHtml = `<table style="width:100%;border-collapse:collapse;font-size:0.875rem">
          <thead><tr style="background:hsl(var(--muted))">
            <th style="padding:0.5rem;border:1px solid hsl(var(--border))">#</th>
            <th style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:left">Chassis Code</th>
            <th style="padding:0.5rem;border:1px solid hsl(var(--border));text-align:right">VINs decoded</th>
          </tr></thead><tbody>${tableRows}</tbody></table>`;
      }
    }
  } catch {
    // Statistics are best-effort; render without data if query fails
  }

  if (tableHtml) {
    dataHtml = `
      <h2 style="font-size:1.25rem;font-weight:600;margin:1.5rem 0 0.75rem">Live Data</h2>
      <div style="overflow-x:auto;margin-bottom:1rem">${tableHtml}</div>
      <p style="font-size:0.75rem;color:hsl(var(--muted-foreground))">Data sourced from VINs decoded on BMV.vin. Updated in real-time.</p>
    `;
  }

  const jsonLd: unknown[] = [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      "name": def.h1,
      "description": def.description,
      "url": canonicalUrl,
      "publisher": { "@type": "Organization", "name": "BMV.VIN", "url": BMV_VIN_BASE },
      "temporalCoverage": `../${new Date().getFullYear()}`,
    },
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": def.h1,
      "description": def.description,
      "dateModified": new Date().toISOString().split("T")[0],
    },
    breadcrumbJsonLd([
      { name: "BMV.VIN", url: BMV_VIN_BASE },
      { name: "Data", url: `${BMV_VIN_BASE}/data` },
      { name: def.h1, url: canonicalUrl },
    ]),
  ];

  const headFragment = buildHead({ title, description: def.description, canonicalUrl, jsonLd, ogType: "article" });

  const rootBody = `
<div style="max-width:860px;margin:0 auto;padding:1.5rem 1rem" data-testid="page-stats-${slug}">
  <nav style="font-size:0.75rem;color:hsl(var(--muted-foreground));margin-bottom:0.75rem">
    <a href="/">BMV.VIN</a> › <span>Data & Statistics</span>
  </nav>
  <h1 style="font-size:1.75rem;font-weight:700;margin-bottom:0.5rem">${esc(def.h1)}</h1>

  <div style="background:hsl(var(--muted));border-left:4px solid hsl(var(--primary));padding:1rem 1.25rem;border-radius:0 0.5rem 0.5rem 0;margin-bottom:1.5rem">
    <p style="margin:0;font-size:0.9375rem"><strong>Key Findings:</strong> ${esc(def.quickAnswer)}</p>
  </div>

  ${dataHtml}

  <h2 style="font-size:1.25rem;font-weight:600;margin:1.5rem 0 0.75rem">Methodology</h2>
  <p>This data is derived from real BMW factory VINs decoded through BMV.vin using BMW's official factory database. Data is updated continuously as new VINs are decoded on the platform.</p>

  <h2 style="font-size:1.25rem;font-weight:600;margin:1.5rem 0 0.75rem">Decode Your BMW VIN</h2>
  ${buildVinInput()}

  <div style="margin-top:2rem;padding:1rem;border:1px solid hsl(var(--border));border-radius:0.5rem;background:hsl(var(--muted))">
    <p style="margin:0;font-size:0.875rem">
      <strong>Find BMW parts →</strong>
      <a href="${escAttr(BMV_PARTS_BASE)}" target="_blank" rel="noopener" style="color:hsl(var(--primary));margin-left:0.5rem">
        Browse 6M+ genuine BMW OEM parts on BMV.parts
      </a>
    </p>
  </div>
</div>`.trim();

  return { status: 200, title, description: def.description, canonicalUrl, headFragment, rootBody, noindex: false };
}

// ---------------------------------------------------------------------------
// Exports — known slugs for sitemap generation
// ---------------------------------------------------------------------------

export const VIN_TOOL_SLUGS = VIN_TOOLS.map(t => t.slug);
export const VIN_TOOL_SLUGS_SET = new Set(VIN_TOOL_SLUGS);
export const COMPARISON_SLUGS = COMPARISONS.map(c => c.slug);
export const STATISTICS_SLUGS = STAT_PAGES.map(d => d.slug);

// The BMW VIN decoder hub slug — used to set canonicals for /<VIN> pages
export const VIN_DECODER_HUB_SLUG = "bmw-vin-decoder";
export const VIN_DECODER_CANONICAL = `${BMV_VIN_BASE}/${VIN_DECODER_HUB_SLUG}`;
