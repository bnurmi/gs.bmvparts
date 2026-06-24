// Default English vinHost strings + getter helper used by the bmv.vin SSR
// layer (Task #96). Other locale packs may override `pack.vinHost` to
// localise; when they don't, the SSR layer falls back to this English
// copy so every locale renders something coherent.

import type { LocaleCode, VinHostStrings } from "./types";
import { getPack } from "./index";

export const enVinHost: VinHostStrings = {
  brand: {
    bmw: "BMW",
    mini: "MINI",
    alpina: "ALPINA",
    rollsRoyce: "Rolls-Royce",
    motorrad: "BMW Motorrad",
  },
  facetKind: {
    chassis: "chassis",
    year: "model year",
    plant: "assembly plant",
    market: "market",
    paint: "paint",
    option: "factory option",
  },

  // -- Home --
  homeMetaTitle: "BMV.VIN — Free BMW VIN Decoder & VIN Lookup",
  homeMetaDescription:
    "Decode any BMW, MINI, ALPINA, Rolls-Royce or BMW Motorrad VIN. Look up factory options, paint, plant, build date and OEM parts — free, instant, no signup.",
  homeH1: "Free BMW VIN decoder",
  homeIntro:
    "Enter a 17-character VIN to decode the model, chassis, engine, paint, factory options, build date and assembly plant. We support every BMW Group brand: BMW, MINI, ALPINA, Rolls-Royce and BMW Motorrad.",
  homeBrandsHeading: "Decode by brand",
  homeFacetsHeading: "Browse by chassis, year, plant, market, paint or option",
  homeGuidesHeading: "VIN guides",
  homeGlossaryHeading: "VIN glossary",

  // -- Brand --
  brandHubMetaTitle: brand => `${brand} VIN decoder — free ${brand} VIN lookup | BMV.VIN`,
  brandHubMetaDescription: brand =>
    `Decode any ${brand} VIN: model, chassis, engine, paint, factory options, build date and assembly plant. Cross-link to OEM parts on bmv.parts.`,
  brandHubH1: brand => `${brand} VIN decoder`,
  brandHubIntro: brand =>
    `Enter a ${brand} VIN to look up the factory record. We decode the WMI/VDS/VIS, model code, model year letter, plant, options and paint.`,
  brandHubWmiHeading: "Manufacturer codes (WMI)",
  brandHubRelatedHeading: "Related decoders",

  // -- Facet --
  facetIndexMetaTitle: kind => `Browse BMW VINs by ${kind} | BMV.VIN`,
  facetIndexMetaDescription: kind =>
    `Browse decoded BMW VINs grouped by ${kind}. Each hub lists example VINs and links to OEM parts.`,
  facetIndexH1: kind => `Browse by ${kind}`,
  facetHubMetaTitle: ({ kind, value }) => `BMW ${value} (${kind}) — VIN examples & OEM parts | BMV.VIN`,
  facetHubMetaDescription: ({ kind, value, cohort }) =>
    `${cohort} decoded BMW VINs for ${kind} ${value}. View example VINs, factory options and shop OEM parts on bmv.parts.`,
  facetHubH1: ({ kind, value }) => `BMW ${value} (${kind})`,
  facetHubExamplesHeading: n => `${n} example VIN${n === 1 ? "" : "s"}`,
  facetHubEmpty: "No decoded VINs in this group yet — try decoding one with the form above.",

  // -- Guides --
  guideIndexMetaTitle: "BMW VIN guides — how VINs work, decoded | BMV.VIN",
  guideIndexMetaDescription:
    "Plain-English guides to decoding BMW VINs: WMI/VDS/VIS, check digit, model year letter, plant codes, paint, SA/option codes and more.",
  guideIndexH1: "BMW VIN guides",
  guideMetaTitle: title => `${title} | BMV.VIN`,
  guideRelatedHeading: "Related guides",

  // -- Glossary --
  glossaryIndexMetaTitle: "BMW VIN glossary — terms, codes & abbreviations | BMV.VIN",
  glossaryIndexMetaDescription:
    "Definitions for every term that appears on a BMW VIN: WMI, VDS, VIS, check digit, model year letter, SA codes, paint codes, plant codes.",
  glossaryIndexH1: "BMW VIN glossary",
  glossaryMetaTitle: term => `${term} — BMW VIN glossary | BMV.VIN`,
  glossaryRelatedHeading: "Related terms",

  // -- Common chrome --
  breadcrumbHome: "BMV.VIN",
  decodeAnotherCta: "Decode another VIN",
  shopOemPartsCta: "Shop OEM parts on bmv.parts",
  vinInputLabel: "VIN (17 characters)",
  vinInputPlaceholder: "WBA…",
  vinInputSubmit: "Decode",
  faqHeading: "Frequently asked questions",
  notFoundH1: "Page not found",
  notFoundBody: "We couldn't find that page. Try the decoder home or browse by chassis, year or plant.",

  // -- Recently decoded + brand top chassis --
  homeRecentlyDecodedHeading: "Recently decoded VINs",
  brandRecentlyDecodedHeading: brand => `Recently decoded ${brand} VINs`,
  brandTopChassisHeading: brand => `Top ${brand} chassis`,

  // -- HowTo on home --
  homeHowToTitle: "How to decode a BMW VIN",
  homeHowToDescription:
    "Step-by-step: enter the 17-character VIN, read the decoded chassis/engine/options, then jump to OEM parts.",
  homeHowToSteps: [
    {
      name: "Find the 17-character VIN",
      text: "Look on the lower windshield, the driver-side door jamb sticker or the V5/title document. Skip I, O and Q — BMW VINs use 0–9 and A–Z minus those three.",
    },
    {
      name: "Paste the VIN into the decoder",
      text: "Use the decoder above. The site identifies the brand from the WMI (first three characters) and routes the lookup automatically.",
    },
    {
      name: "Read the decoded factory record",
      text: "We show chassis, model year, engine, paint, plant, factory options (SA codes) and any owner's manual we can match. Each tab carries a provenance badge so you know whether the answer came from BMW first-party data or a fallback decoder.",
    },
    {
      name: "Browse OEM parts that fit this VIN",
      text: "Click the 'Shop OEM parts' link to jump to the bmv.parts catalog filtered to this exact chassis.",
    },
  ],

  // -- Facet pagination + cross-rail --
  facetPaginationLabel: ({ page, total }) => `Page ${page} of ${total}`,
  facetPaginationPrev: "← Previous",
  facetPaginationNext: "Next →",
  facetCrossRailHeading: kind => `Browse other ${kind}s in this group`,
  facetThinCohortNote: cohort =>
    `Only ${cohort} decoded VIN${cohort === 1 ? "" : "s"} in this group so far — page is hidden from search engines until the cohort grows.`,

  // -- VIN tokenization --
  vinTokenHeading: "What this VIN means",
  vinTokenIntro:
    "Every BMW VIN is 17 characters split into three sections. Hover or tap a label to see the glossary entry.",
  vinTokenWmiLabel: "WMI",
  vinTokenWmiHint: "World Manufacturer Identifier (positions 1–3) — identifies the manufacturer + region.",
  vinTokenVdsLabel: "VDS",
  vinTokenVdsHint: "Vehicle Descriptor Section (positions 4–8) — model, body, restraint system.",
  vinTokenCheckLabel: "Check digit",
  vinTokenCheckHint: "Position 9 — ISO 3779 checksum that catches single-character transcription errors.",
  vinTokenMyLetterLabel: "Model year",
  vinTokenMyLetterHint: year =>
    year ? `Position 10 — letter encodes model year (${year}).` : "Position 10 — letter encodes the model year.",
  vinTokenPlantLabel: "Plant",
  vinTokenPlantHint: city =>
    city ? `Position 11 — single character identifies the assembly plant (${city}).` : "Position 11 — single character identifies the assembly plant.",
  vinTokenSerialLabel: "Serial",
  vinTokenSerialHint: "Positions 12–17 — sequential production number.",
};

export function getVinHostStrings(locale: LocaleCode): VinHostStrings {
  const pack = getPack(locale);
  return pack.vinHost ?? enVinHost;
}
