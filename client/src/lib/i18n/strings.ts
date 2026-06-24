// UI string dictionaries used by the visitor-facing pages (Home, Search,
// BmwModels, PartFinder, VinDecoder, About, Friends) plus the shared
// sidebar/header. The active locale is derived from the URL prefix via
// splitLocaleFromPath; see useT.ts for the lookup hook.
//
// Only prominent, visible UI copy lives here. Admin-only controls,
// deeply-technical inline values (factory option labels, raw NHTSA fields,
// etc.) and copy already produced by server-side locale packs (SEO meta,
// part-detail intro, hub blurbs) intentionally remain English.
//
// Translations were drafted in-house and are flagged for native-speaker
// review by the existing project task "Have native speakers review the
// auto-generated translated copy for fluency".

import type { ClientLocale } from "../locale";

export interface UiStrings {
  common: {
    signIn: string;
    admin: string;
    back: string;
    home: string;
    loading: string;
    retry: string;
    cancel: string;
    clear: string;
    clearAll: string;
    search: string;
    browse: string;
    refine: string;
    visit: string;
    copyCode: string;
    copied: string;
    parts: string;
    models: string;
    variants: string;
    results: string;
  };
  sidebar: {
    dashboard: string;
    searchParts: string;
    partFinder: string;
    vinDecoder: string;
    modelReference: string;
    about: string;
    recommendedSites: string;
    myCars: string;
    /**
     * @deprecated Was used as a fallback when the parts count was 0.
     * That made slow `/api/stats` responses look like a system status
     * ("Offline Database") to visitors. Replaced by `tagline` below.
     * Kept on the type for now so older code paths still compile, but
     * never read by the live UI.
     */
    offlineDatabase: string;
    /** Neutral brand line shown under the logo when the parts count
     *  isn't loaded yet. Must NOT read like a system/status word. */
    tagline: string;
    partsCount: (n: string) => string;
    syncedSummary: (synced: number, total: number) => string;
    aiBadge: string;
    bmwBadge: string;
    servicing?: string;
  };
  servicing?: {
    title: string;
    subtitle: string;
    lookupHeading: string;
    lookupPlaceholder: string;
    lookupButton: string;
    fluidsHeader: string;
    filtersHeader: string;
    aiBannerTitle: string;
    aiBannerBody: string;
    pinnedByAdmin: string;
    autoDerived: string;
    verifiedBadge: string;
    aiDraftBadge: string;
    noDataBadge: string;
    notDocumented: string;
    noPartNumber: string;
    openCta: string;
    coverageHeading: string;
    coverageBody: string;
    coverageButton: string;
    capacityLabel?: string;
    gradeLabel?: string;
    loadErrorTitle?: string;
    noKeyHint?: string;
    openInVinDecoder?: string;
    coverageRequestedToast?: string;
    coverageRequestedBody?: string;
    coverageErrorToast?: string;
    coverageErrorBody?: string;
    needHint?: string;
    notApplicable?: string;
    tabIntro?: string;
  };
  status: {
    notSynced: string;
    syncing: string;
    complete: string;
    error: string;
    unavailable: string;
    cancelled: string;
    ready: string;
  };
  home: {
    heading: string;
    intro: string;
    statCarsTracked: string;
    statFullySynced: string;
    statTotalParts: string;
    syncingBanner: string;
    popularChassis: string;
    popularChassisSub: string;
    modelsCount: (n: number) => string;
    aboutLabel: string;
    aboutBody: string;
    browseBySeries: string;
    browseByChassis: string;
    seriesLabel: (s: string) => string;
    more: string;
    syncingCatalog: string;
    categories: string;
    groups: string;
    refresh: string;
    sync: string;
    refreshTooltip: string;
    syncTooltip: string;
    notInCatalog: string;
    startedSyncingToast: (name: string) => string;
    errorToast: string;
    /** Generic "couldn't load — retry" message used by the homepage
     *  stat cards and Popular Chassis grid when their queries error
     *  out or hit the request timeout. Pairs with common.retry. */
    couldNotLoad: string;
  };
  search: {
    heading: string;
    intro: string;
    placeholder: string;
    noResults: (q: string) => string;
    noResultsHint: string;
    resultsFor: (n: number, q: string) => string;
    showingFirst100: string;
    filterByCar: string;
    enterAtLeast2: string;
    syncTip: string;
    dashboardLink: string;
    qty: string;
  };
  models: {
    heading: string;
    introFallback: (count: string) => string;
    placeholder: string;
    resultsBadge: (n: string) => string;
    all: string;
    less: string;
    showMore: (n: number) => string;
    failedToLoad: string;
    emptyTitle: string;
    emptyHintSearch: string;
    emptyHintInitial: string;
    variantsCount: (n: number) => string;
    modelDatabase: string;
    syncModels: string;
    importLegacy: string;
    importing: string;
  };
  partFinder: {
    heading: string;
    intro: string;
    signInRequiredTitle: string;
    signInRequiredBody: string;
    signInToUse: string;
    uploadHeading: string;
    uploadDropHint: string;
    uploadLimits: (max: number) => string;
    chooseFiles: string;
    imageCount: (n: number, max: number) => string;
    addMore: string;
    identifyOne: string;
    identifyMany: string;
    analyzingOne: (n: number) => string;
    analyzingMany: (n: number) => string;
    analyzingSubOne: string;
    analyzingSubMany: string;
    analysisFailed: string;
    aiIdentification: string;
    noExactMatches: string;
    noExactMatchesHint: string;
    modelPlaceholder: string;
    searchAgain: string;
    checkingExternal: string;
    oemMatches: string;
    oemMatchesHint: string;
    checkingStock: string;
    partAvailable: string;
    partsAvailable: (n: number) => string;
    inStock: string;
    tenPercentOff: string;
    couponPitch: string;
    couponCopiedTitle: string;
    couponCopiedBody: (code: string) => string;
    catalogMatches: string;
    partNumberMatch: string;
    buy: string;
    refinePrompt: string;
    plusMore: (n: number) => string;
    limitReachedTitle: string;
    limitReachedBody: (max: number) => string;
    skippedTitle: string;
    skippedBody: string;
    onlyAddedBody: (remaining: number, max: number) => string;
  };
  vin: {
    heading: string;
    intro: string;
    placeholder: string;
    decode: string;
    decoding: string;
    examples: string;
    lengthHint: (current: number) => string;
    decodeFailed: string;
    validationNotes: string;
    valid: string;
    enriching: string;
    fullyEnriched: string;
    partiallyEnriched: string;
    enrichmentUnavailable: string;
    notBmw: string;
    invalidStructure: string;
    noCatalogMatches: string;
    closestChassis: string;
    safetyFeatures: string;
    partsCatalog: string;
    decodeProgress: string;
    decodeProgressSub: string;
  };
  vinSeo: {
    pageTitle: string;
    pageDescription: string;
    pageKeywords: string;
    introH1: string;
    introBody: string;
    whatYouGetHeading: string;
    whatYouGetIntro: string;
    whatYouGetItems: string[];
    howItWorksHeading: string;
    howItWorksIntro: string;
    howItWorksSteps: { name: string; text: string }[];
    bimmerWorkHeading: string;
    bimmerWorkBody: string;
    coverageHeading: string;
    coverageBody: string;
    faqHeading: string;
    faqs: { q: string; a: string }[];
    breadcrumbHome: string;
    breadcrumbVin: string;
    landingSummaryHeading: string;
    landingOptionsHeading: string;
    landingPartsHeading: string;
    landingPartsBody: string;
    landingPartsLink: string;
    landingDecoderLink: string;
    landingNoBmwTitle: string;
    landingNoBmwBody: string;
    landingFactCells: {
      vin: string;
      chassis: string;
      modelYear: string;
      engine: string;
      drivetrain: string;
      transmission: string;
      market: string;
      paint: string;
      upholstery: string;
      productionDate: string;
      plant: string;
    };
  };
  about: {
    heading: string;
    intro: string;
    statsHeading: string;
    statBmwModels: string;
    statFullyCataloged: string;
    statOemParts: string;
    toolsHeading: string;
    catalogTitle: string;
    catalogBody: string;
    catalogCta: string;
    searchTitle: string;
    searchBody: string;
    searchCta: string;
    vinTitle: string;
    vinBody: string;
    vinCta: string;
    aiTitle: string;
    aiBody: string;
    aiCta: string;
    faqHeading: string;
    faq: { question: string; answer: string }[];
    getStartedHeading: string;
    getStartedBody: string;
    browseCatalog: string;
    allModels: string;
    searchPartsBtn: string;
    recommendedSitesBtn: string;
  };
  friends: {
    heading: string;
    intro: string;
    visitX: (name: string) => string;
    lookingForPartsHeading: string;
    lookingForPartsBody: string;
  };
  languageSwitcher: {
    aria: string;
  };
  themeToggle: {
    light: string;
    dark: string;
    auto: string;
    title: (current: string) => string;
  };
  topbar: {
    universalPlaceholder: string;
    universalShortcut: string;
    statusFresh: (h: number) => string;
    statusStale: (h: number) => string;
    statusUnknown: string;
    showAllModels: (n: number) => string;
  };
  hero: {
    eyebrow: string;
    placeholder: string;
    decode: string;
    helper: string;
  };
}

// English baseline. Other locales mirror this shape.
export const EN: UiStrings = {
  common: {
    signIn: "Sign In",
    admin: "Admin",
    back: "Back",
    home: "Home",
    loading: "Loading…",
    retry: "Retry",
    cancel: "Cancel",
    clear: "Clear",
    clearAll: "Clear All",
    search: "Search",
    browse: "Browse",
    refine: "Refine",
    visit: "Visit",
    copyCode: "Copy Code",
    copied: "Copied",
    parts: "parts",
    models: "models",
    variants: "variants",
    results: "results",
  },
  sidebar: {
    dashboard: "Dashboard",
    searchParts: "Search Parts",
    partFinder: "Part Finder",
    vinDecoder: "VIN Decoder",
    modelReference: "Model Reference",
    about: "About",
    recommendedSites: "Recommended Sites",
    myCars: "My Cars",
    offlineDatabase: "OEM Parts Catalog",
    tagline: "OEM Parts Catalog",
    partsCount: (n) => `${n} parts`,
    syncedSummary: (synced, total) => `${synced} of ${total} cars synced`,
    aiBadge: "AI",
    bmwBadge: "BMW",
    servicing: "Servicing",
  },
  servicing: {
    capacityLabel: "Capacity",
    gradeLabel: "Grade",
    loadErrorTitle: "Couldn't load servicing info",
    noKeyHint: "We could not determine the chassis + engine for this VIN, so servicing info isn't available.",
    openInVinDecoder: "Open in VIN decoder",
    coverageRequestedToast: "Coverage requested",
    coverageRequestedBody: "We'll prioritize this chassis + engine.",
    coverageErrorToast: "Could not record request",
    coverageErrorBody: "Try again later.",
    needHint: "Need fluid capacities & filter part numbers for routine servicing?",
    notApplicable: "Not applicable for this configuration.",
    tabIntro: "Fluid capacities and OEM filter part numbers for routine BMW servicing.",
    title: "Quick Servicing Info",
    subtitle: "Fluid capacities and OEM filter part numbers for routine BMW servicing — looked up by VIN.",
    lookupHeading: "Look up servicing info by VIN",
    lookupPlaceholder: "Enter 17-character VIN",
    lookupButton: "Look up",
    fluidsHeader: "Fluid capacities",
    filtersHeader: "Filter part numbers",
    aiBannerTitle: "Some fields are AI drafts.",
    aiBannerBody: "Anything marked “AI draft” has not yet been verified by a human admin against an official BMW source. Treat it as a starting point, not a service spec.",
    pinnedByAdmin: "Pinned by admin",
    autoDerived: "Auto-derived from catalog",
    verifiedBadge: "Verified by admin",
    aiDraftBadge: "AI draft",
    noDataBadge: "No data",
    notDocumented: "Not yet documented for this engine.",
    noPartNumber: "No part number on file.",
    openCta: "Open Quick Servicing Info",
    coverageHeading: "No servicing data yet",
    coverageBody: "Leave your email if you'd like to be notified when admins fill this in.",
    coverageButton: "Request coverage",
  },
  status: {
    notSynced: "Not Synced",
    syncing: "Syncing…",
    complete: "Complete",
    error: "Error",
    unavailable: "Unavailable",
    cancelled: "Cancelled",
    ready: "Ready",
  },
  home: {
    heading: "BMW Parts, decoded.",
    intro: "Decode a VIN. Drill a chassis. Cross-reference a part. Full catalog with live multi-region dealer pricing.",
    statCarsTracked: "Cars Tracked",
    statFullySynced: "Fully Synced",
    statTotalParts: "Total Parts",
    syncingBanner: "Syncing in progress — this page auto-refreshes",
    popularChassis: "Popular Chassis",
    popularChassisSub: "Most-catalogued BMW chassis",
    modelsCount: (n) => `${n} models`,
    aboutLabel: "About:",
    aboutBody: "Click any car card to browse its parts catalog. Admin tools for data sync, dedup, and export are available in the Admin panel.",
    browseBySeries: "Browse by Series",
    browseByChassis: "Browse by Chassis",
    seriesLabel: (s) => `${s} Series`,
    more: "+more",
    syncingCatalog: "Syncing catalog…",
    categories: "Categories",
    groups: "Groups",
    refresh: "Refresh",
    sync: "Sync",
    refreshTooltip: "Re-sync to update parts data",
    syncTooltip: "Download parts catalog",
    notInCatalog: "Not in catalog",
    startedSyncingToast: (name) => `Started syncing ${name}`,
    errorToast: "Error",
    couldNotLoad: "Couldn't load — try again.",
  },
  search: {
    heading: "Search Parts",
    intro: "Search across all synced BMW M car catalogs by part number or description",
    placeholder: "Search by part number (e.g. 11127848862) or description (e.g. oil filter)…",
    noResults: (q) => `No results for "${q}"`,
    noResultsHint: "Try a different part number or description",
    resultsFor: (n, q) => `${n} ${n === 1 ? "result" : "results"} for "${q}"`,
    showingFirst100: " (showing first 100)",
    filterByCar: "Filter by car",
    enterAtLeast2: "Enter at least 2 characters to search",
    syncTip: "Tip: You need to sync at least one car first from the",
    dashboardLink: "Dashboard",
    qty: "Qty:",
  },
  models: {
    heading: "BMW Model Reference",
    introFallback: (count) => `Complete database of BMW model variants — ${count} models across all chassis codes.`,
    placeholder: "Search models, chassis codes, engines…",
    resultsBadge: (n) => `${n} results`,
    all: "All",
    less: "Less",
    showMore: (n) => `+${n} more`,
    failedToLoad: "Failed to load models.",
    emptyTitle: "No models in database",
    emptyHintSearch: "No models match your search. Try a different query.",
    emptyHintInitial: 'Click "Sync Models" above to import all 1,350+ BMW model variants.',
    variantsCount: (n) => `${n} variants`,
    modelDatabase: "Model Database",
    syncModels: "Sync Models",
    importLegacy: "Import Legacy",
    importing: "Importing…",
  },
  partFinder: {
    heading: "Part Finder",
    intro: "Upload photos of BMW parts to find their part numbers",
    signInRequiredTitle: "Sign in required",
    signInRequiredBody: "The AI Part Finder uses image analysis which requires an account.",
    signInToUse: "Sign In to Use Part Finder",
    uploadHeading: "Upload photos",
    uploadDropHint: "Drop images here or click to browse",
    uploadLimits: (max) => `Up to ${max} images, JPEG/PNG/WebP, 10MB each`,
    chooseFiles: "Choose Files",
    imageCount: (n, max) => `${n} of ${max} images`,
    addMore: "Add More",
    identifyOne: "Identify Part",
    identifyMany: "Identify Parts",
    analyzingOne: (n) => `Analyzing ${n} image…`,
    analyzingMany: (n) => `Analyzing ${n} images…`,
    analyzingSubOne: "AI is identifying parts in your photo",
    analyzingSubMany: "AI is identifying parts in your photos",
    analysisFailed: "Analysis Failed",
    aiIdentification: "AI Identification",
    noExactMatches: "No exact matches found",
    noExactMatchesHint: "Providing your BMW model can help narrow down the search. What model is this part for?",
    modelPlaceholder: "e.g. M2, M3, M4, 330i…",
    searchAgain: "Search Again",
    checkingExternal: "Checking the OEM parts catalog…",
    oemMatches: "OEM Catalog Matches",
    oemMatchesHint: "Not yet in our local database, but found directly in the OEM catalog.",
    checkingStock: "Checking availability at MPerformance.parts…",
    partAvailable: "Part Available",
    partsAvailable: (n) => `${n} Parts Available`,
    inStock: "In Stock",
    tenPercentOff: "10% Off",
    couponPitch: "Get 10% off at MPerformance.parts — Australia's leading BMW parts supplier. Use coupon code at checkout:",
    couponCopiedTitle: "Coupon code copied!",
    couponCopiedBody: (code) => `${code} — 10% off at MPerformance.parts`,
    catalogMatches: "Catalog Matches",
    partNumberMatch: "Part # Match",
    buy: "Buy",
    refinePrompt: "Want to narrow results? Specify your BMW model:",
    plusMore: (n) => `+${n} more`,
    limitReachedTitle: "Limit reached",
    limitReachedBody: (max) => `Maximum ${max} images allowed`,
    skippedTitle: "Some files skipped",
    skippedBody: "Only image files under 10MB are accepted",
    onlyAddedBody: (remaining, max) => `Only ${remaining} more image(s) could be added (max ${max})`,
  },
  vin: {
    heading: "BMW VIN Decoder",
    intro: "Enter a full 17-digit VIN or BMW last 7 serial number to decode your vehicle.",
    placeholder: "Enter VIN (17 chars) or Last 7…",
    decode: "Decode",
    decoding: "Decoding…",
    examples: "Examples:",
    lengthHint: (current) => `Enter exactly 17 characters (full VIN) or 7 characters (BMW serial). Currently: ${current}`,
    decodeFailed: "Decode Failed",
    validationNotes: "Validation Notes",
    valid: "Valid",
    enriching: "Enriching…",
    fullyEnriched: "Data Fully Enriched",
    partiallyEnriched: "Partially Enriched",
    enrichmentUnavailable: "Enrichment unavailable",
    notBmw: "This VIN is not a BMW. Catalog matches are only available for BMW vehicles.",
    invalidStructure: "This VIN failed structural validation (check digit) and could not be resolved to a production record.",
    noCatalogMatches: "No catalog matches for this vehicle.",
    closestChassis: "Closest available chassis:",
    safetyFeatures: "Safety Features",
    partsCatalog: "Parts Catalog",
    decodeProgress: "Decoding VIN",
    decodeProgressSub: "Looking up factory record from BMW data sources",
  },
  vinSeo: {
    pageTitle: "Free BMW, ALPINA, MINI, Rolls-Royce & BMW Motorrad VIN Decoder",
    pageDescription: "Decode any BMW group VIN — BMW, ALPINA, MINI, Rolls-Royce, BMW Motorrad — to reveal chassis, engine, factory options, paint, upholstery, plant and build date. Free, instant, and matched into the OEM parts catalog. A reliable bimmer.work alternative.",
    pageKeywords: "BMW VIN decoder, ALPINA VIN decoder, MINI VIN decoder, Rolls-Royce VIN decoder, BMW Motorrad VIN decoder, free BMW VIN check, decode BMW VIN, bimmer.work alternative, BMW chassis lookup, BMW production options, VIN to options, BMW build sheet, BMW factory options, MINI Cooper VIN, Rolls-Royce Phantom VIN, S1000RR VIN",
    introH1: "Free BMW VIN Decoder",
    introBody: "Enter any 17-character BMW group VIN (BMW, ALPINA, MINI, Rolls-Royce or BMW Motorrad) — or the last 7 of a BMW production sequence — and we'll return the same level of detail you'd see on bimmer.work: chassis, engine, plant, build date, factory options, paint, upholstery, and the parts catalog branch your car maps into. No account required. From here you can jump straight into a chassis hub (e.g. E90, F30, G80) or a series hub (1, 2, 3, 4, 5, 6, 7, 8, X, Z, M, i) to browse OEM diagrams.",
    whatYouGetHeading: "What our BMW VIN decoder reveals",
    whatYouGetIntro: "Every successful BMW VIN lookup on BMV.parts returns:",
    whatYouGetItems: [
      "Chassis code (E, F, G, U, I) and BMW series (1/2/3/4/5/6/7/8/X/Z/M/i)",
      "Engine family and code, drivetrain layout, and transmission",
      "Plant of assembly, country, and exact build date",
      "Original paint code and upholstery / interior trim",
      "Full list of factory option codes (S- and P-codes) with English descriptions",
      "Direct links into the matching BMW OEM parts catalog branch",
    ],
    howItWorksHeading: "How BMW VIN decoding works",
    howItWorksIntro: "BMV.parts decodes each VIN in four deterministic steps:",
    howItWorksSteps: [
      { name: "Enter the VIN", text: "Type or paste the 17-character BMW VIN, or the last 7 characters of the production sequence. Spaces and dashes are stripped automatically." },
      { name: "Validate the structure", text: "We validate the WMI, plant code, model year and check digit, and resolve the BMW VDS pattern to a chassis using a curated VDS-to-chassis table backed by our BMW model database." },
      { name: "Enrich from BMW factory data", text: "We look up the factory build record to attach paint code, upholstery, drivetrain, and every S- and P-code option that left the production line on your car." },
      { name: "Match the parts catalog", text: "Your decoded chassis is cross-referenced with our BMW OEM parts catalog so you can jump straight to brakes, suspension, cooling, electronics and body parts for that specific car." },
    ],
    bimmerWorkHeading: "Need a bimmer.work alternative?",
    bimmerWorkBody: "BMV.parts uses the same kind of factory-options pipeline that powers bimmer.work, so when bimmer.work is slow, rate-limited, or unreachable you can decode the same VIN here and get equivalent chassis, paint and option-code detail — and stay on the same page to browse OEM parts for that car.",
    coverageHeading: "Supported BMW chassis",
    coverageBody: "We cover every modern BMW chassis from the E-series (E30 / E36 / E39 / E46 / E60 / E90) through the F- and G-series (F10 / F30 / F80 / F82 / G20 / G80 / G82) into the current U-series and i-series electric platforms. MINI, Rolls-Royce and BMW Motorrad VINs that use BMW-issued WMIs (WBA / WBS / WBY / WMW / 5UX / 5YM / 5UM / WUF) are also supported.",
    faqHeading: "BMW VIN decoder — frequently asked questions",
    faqs: [
      { q: "Is this BMW VIN decoder free?", a: "Yes. Decoding any BMW VIN on BMV.parts is free and requires no account. VINs you save to a private garage are kept private and are never published, indexed, or included in any sitemap." },
      { q: "What does a BMW VIN tell you?", a: "A BMW VIN encodes the manufacturer (WMI), model line and body (VDS), the check digit, the model year, the plant of assembly, and a unique production sequence. Combined with BMW's factory build records it also reveals every option code, the original paint, and the upholstery your car was built with." },
      { q: "Can I decode just the last 7 of my VIN?", a: "Yes. The last 7 characters of a BMW VIN are the production sequence and are unique within a given chassis and plant. We accept either the full 17-character VIN or the 7-character production sequence." },
      { q: "Do you support every BMW chassis?", a: "We cover every modern BMW chassis from the early E-series through the current G, U and i series. MINI, Rolls-Royce and BMW Motorrad VINs using a BMW-issued WMI are also supported." },
      { q: "Is bimmer.work down? Can I use BMV.parts instead?", a: "Yes. BMV.parts uses the same factory-options pipeline as bimmer.work, so when bimmer.work is slow or unreachable you can decode the same VIN here and get equivalent chassis, paint and option-code detail." },
      { q: "Why does my VIN show 'partially enriched'?", a: "Some very recent builds or grey-market chassis are not yet present in the public BMW factory records we cache. The structural decode (chassis, engine, plant, model year) still works; option enrichment may follow as factory data is published." },
      { q: "Are decoded VINs indexed by search engines?", a: "Yes — public VIN landing pages (those produced by the public decoder) are indexable so people who search for that VIN can find an OEM parts catalog match. VINs you save to your private garage are never indexed and never appear in our sitemap." },
      { q: "Does this work for ALPINA, MINI, Rolls-Royce or BMW Motorrad?", a: "Yes. ALPINA-built BMWs use the WBA / WBS WMI and decode through the same pipeline. MINI (WMW), Rolls-Royce (SBM) and BMW Motorrad (WBW / WUF) all use BMW-issued VINs and resolve into the same chassis-hub and series-hub navigation as BMW cars." },
    ],
    breadcrumbHome: "Home",
    breadcrumbVin: "VIN Decoder",
    landingSummaryHeading: "Vehicle summary",
    landingOptionsHeading: "Factory options",
    landingPartsHeading: "BMW OEM parts catalog",
    landingPartsBody: "Browse OEM parts for this BMW. Diagrams, part numbers, fitment and cross-references are organised by system group (engine, suspension, electrical, body, interior).",
    landingPartsLink: "Browse OEM parts for this BMW",
    landingDecoderLink: "Decode another BMW VIN",
    landingNoBmwTitle: "This VIN is not a BMW",
    landingNoBmwBody: "BMV.parts only catalogs BMW, MINI, Rolls-Royce and BMW Motorrad VINs. The VIN you requested decodes to a different manufacturer.",
    landingFactCells: {
      vin: "VIN",
      chassis: "Chassis",
      modelYear: "Model year",
      engine: "Engine",
      drivetrain: "Drivetrain",
      transmission: "Transmission",
      market: "Market",
      paint: "Paint",
      upholstery: "Upholstery",
      productionDate: "Build date",
      plant: "Plant",
    },
  },
  about: {
    heading: "About BMV.parts",
    intro: "BMV.parts is a free, comprehensive reference for BMW OEM parts. We catalog part numbers, exploded diagrams, and system groups across hundreds of BMW models and generations — making it easy for enthusiasts, mechanics, and DIYers to find exactly the right part.",
    statsHeading: "Database at a Glance",
    statBmwModels: "BMW Models",
    statFullyCataloged: "Fully Cataloged",
    statOemParts: "OEM Parts",
    toolsHeading: "Tools & Features",
    catalogTitle: "Parts Catalog",
    catalogBody: "Browse exploded diagrams organized by system group for every BMW model in our database. Each diagram shows individual parts with OEM numbers, descriptions, and quantities.",
    catalogCta: "Browse Catalog",
    searchTitle: "Part Search",
    searchBody: "Search across the entire database by part number, description, or keyword. Results show which models use each part and link directly to the relevant diagrams.",
    searchCta: "Search Parts",
    vinTitle: "VIN Decoder",
    vinBody: "Decode any BMW VIN to reveal model details, engine type, production plant, and build date. Useful for confirming your exact specification before ordering parts.",
    vinCta: "Decode a VIN",
    aiTitle: "AI Part Identifier",
    aiBody: "Upload a photo of a BMW part and let our AI identify it. Get likely part numbers and links to diagrams — perfect when you have a part in hand but no number.",
    aiCta: "Identify a Part",
    faqHeading: "Frequently Asked Questions",
    faq: [
      { question: "How do I find a BMW part number?", answer: "Use our parts catalog by navigating to your specific BMW model. Each model page features exploded diagrams organized by system group (engine, suspension, body, etc.). Click any diagram to see individual parts with their OEM part numbers, descriptions, and quantities. You can also use the search bar to look up parts by description or partial part number." },
      { question: "What is a BMW chassis code?", answer: "A BMW chassis code (also called a body type or platform code) is an alphanumeric identifier that BMW assigns to each vehicle platform. Examples include E46 (3 Series 1998-2006), F80 (M3 2014-2018), and G20 (3 Series 2019+). The chassis code tells you the generation and basic configuration of the vehicle, which is essential for finding the correct parts. You can browse all chassis codes on our Chassis page." },
      { question: "What is the difference between BMW OEM and aftermarket parts?", answer: "OEM (Original Equipment Manufacturer) parts are made by the same manufacturer that produced the original part for BMW. They carry the BMW part number and meet BMW's exact specifications. Aftermarket parts are produced by third-party manufacturers and may vary in quality and fit. BMV.parts catalogs OEM part numbers so you can cross-reference them when shopping for parts from any source." },
      { question: "How does the BMW VIN decoder work?", answer: "Our VIN decoder breaks down your 17-character BMW Vehicle Identification Number to reveal details about your car including the model, engine type, production plant, and build date. Simply enter your VIN on the VIN Decoder page and we'll decode each segment. This helps you confirm your exact vehicle specification when ordering parts." },
      { question: "How does the AI Part Identifier work?", answer: "The AI Part Identifier lets you upload a photo of a BMW part or component. Our AI analyzes the image and attempts to identify the part, providing you with likely part numbers, descriptions, and links to the relevant diagrams in our catalog. This is especially useful when you have a physical part but don't know its number." },
      { question: "Can I save my BMW to quickly find parts later?", answer: "Yes. Use the My Garage feature to save your BMW models. Once saved, you can quickly jump to your car's parts catalog without searching each time. Sign in or create an account to access this feature." },
      { question: "How often is the parts database updated?", answer: "Our database is regularly synchronized with BMW's official parts catalogs. Each vehicle's parts data is individually synced, and you can see the sync status on the home page. We continuously expand coverage to include new models and updated part numbers." },
    ],
    getStartedHeading: "Get Started",
    getStartedBody: "Ready to find your BMW parts? Jump into the catalog or use one of our tools.",
    browseCatalog: "Browse Catalog",
    allModels: "All Models",
    searchPartsBtn: "Search Parts",
    recommendedSitesBtn: "Recommended Sites",
  },
  friends: {
    heading: "Recommended BMW Resources",
    intro: "These are websites and tools we recommend for BMW parts, accessories, and vehicle services. Each one serves a unique role in the BMW parts ecosystem.",
    visitX: (name) => `Visit ${name}`,
    lookingForPartsHeading: "Looking for Parts?",
    lookingForPartsBody: "Start by finding the exact OEM part number in our catalog, then check availability at any of the suppliers above.",
  },
  languageSwitcher: {
    aria: "Change language",
  },
  themeToggle: {
    light: "Light",
    dark: "Dark",
    auto: "Auto",
    title: (current) => `Theme: ${current} (click to cycle)`,
  },
  topbar: {
    universalPlaceholder: "Search part number, VIN, or chassis (E46, F30, G20)…",
    universalShortcut: "⌘K",
    statusFresh: (h) => `Catalog · synced ${h}h ago`,
    statusStale: (h) => `Catalog · last sync ${h}h ago`,
    statusUnknown: "Catalog · sync pending",
    showAllModels: (n) => `Show all ${n} →`,
  },
  hero: {
    eyebrow: "PARTS · VIN · CHASSIS · DIAGRAMS",
    placeholder: "Enter VIN, part number, or chassis (E46, F30, G20)",
    decode: "Decode →",
    helper: "17-char VIN routes to the decoder. Chassis codes route to the model page. Anything else is searched as a part.",
  },
};
