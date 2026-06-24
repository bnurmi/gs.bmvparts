// =============================================================================
// BMV.vin SEO Growth Engine (Task #259)
// =============================================================================
// Provides:
//  1. Keyword discovery (24-hour cron) — seeds VIN-intent keyword patterns,
//     expands per chassis code, clusters by intent, upserts into seo_keywords.
//  2. AI content engine — GPT-5 queue-driven guide generation that populates
//     bmv_vin_guide rows (reusing the existing guide SSR infrastructure).
//  3. 90-day refresh engine — processes seo_refresh_queue, re-generates
//     outdated content, updates dateModified in guide rows.
//  4. Internal linking engine — after each guide is created/refreshed,
//     ensures cross-links (tool → guide, guide → BMV.parts CTA, Carvertical
//     affiliate on buyer-intent pages).
//  5. Content page registry — upserts into seo_content_pages to track all
//     programmatic pages for the admin dashboard.
// =============================================================================

import OpenAI from "openai";
import { db } from "../storage";
import { sql } from "drizzle-orm";
import type { InsertSeoKeyword, InsertSeoContentPage, InsertBmvVinGuide } from "@shared/schema";

const PROJECT = "bmv.vin";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ---------------------------------------------------------------------------
// Keyword seed library (Tier 1–7 from strategy)
// ---------------------------------------------------------------------------
const VIN_INTENT_SEEDS: Array<{ keyword: string; intent: string; volume?: number; priority: number; pageTargeting?: string }> = [
  // Tier 1 — Head terms
  { keyword: "BMW VIN decoder", intent: "tool", volume: 40000, priority: 10, pageTargeting: "/bmw-vin-decoder" },
  { keyword: "BMW VIN lookup", intent: "tool", volume: 25000, priority: 10, pageTargeting: "/bmw-vin-decoder" },
  { keyword: "BMW VIN check", intent: "tool", volume: 15000, priority: 10, pageTargeting: "/bmw-vin-decoder" },
  { keyword: "BMW VIN number decoder", intent: "informational", volume: 8000, priority: 9, pageTargeting: "/bmw-vin-decoder" },
  { keyword: "decode BMW VIN", intent: "tool", volume: 10000, priority: 9, pageTargeting: "/bmw-vin-decoder" },
  { keyword: "free BMW VIN decoder", intent: "tool", volume: 5000, priority: 8, pageTargeting: "/bmw-vin-decoder" },
  { keyword: "BMW VIN decoder free", intent: "tool", volume: 5000, priority: 8, pageTargeting: "/bmw-vin-decoder" },
  { keyword: "check BMW VIN number", intent: "tool", volume: 4000, priority: 7, pageTargeting: "/bmw-vin-decoder" },
  // Tier 2 — Build sheet & options
  { keyword: "BMW build sheet lookup", intent: "tool", volume: 3000, priority: 8, pageTargeting: "/bmw-build-sheet-lookup" },
  { keyword: "BMW options lookup", intent: "tool", volume: 2000, priority: 7, pageTargeting: "/bmw-options-lookup" },
  { keyword: "BMW build sheet by VIN", intent: "tool", volume: 2500, priority: 8, pageTargeting: "/bmw-build-sheet-lookup" },
  { keyword: "BMW options by VIN", intent: "tool", volume: 2000, priority: 7, pageTargeting: "/bmw-options-lookup" },
  { keyword: "BMW factory options lookup", intent: "informational", volume: 1500, priority: 6, pageTargeting: "/bmw-options-lookup" },
  { keyword: "BMW SA codes list", intent: "informational", volume: 1200, priority: 5 },
  { keyword: "BMW paint code lookup", intent: "tool", volume: 4000, priority: 8, pageTargeting: "/bmw-paint-code-lookup" },
  { keyword: "BMW paint code by VIN", intent: "tool", volume: 3000, priority: 8, pageTargeting: "/bmw-paint-code-lookup" },
  { keyword: "BMW colour code lookup", intent: "tool", volume: 2000, priority: 7, pageTargeting: "/bmw-paint-code-lookup" },
  { keyword: "BMW production date lookup", intent: "tool", volume: 2500, priority: 8, pageTargeting: "/bmw-production-date-lookup" },
  { keyword: "BMW production date by VIN", intent: "tool", volume: 2000, priority: 8, pageTargeting: "/bmw-production-date-lookup" },
  { keyword: "BMW build date by VIN", intent: "tool", volume: 1500, priority: 7, pageTargeting: "/bmw-production-date-lookup" },
  { keyword: "BMW plant code lookup", intent: "informational", volume: 800, priority: 5, pageTargeting: "/bmw-plant-code-lookup" },
  // Tier 3 — Specific field lookups
  { keyword: "BMW engine code by VIN", intent: "tool", volume: 2000, priority: 7, pageTargeting: "/bmw-engine-code-lookup" },
  { keyword: "BMW transmission code VIN", intent: "tool", volume: 1200, priority: 6, pageTargeting: "/bmw-engine-code-lookup" },
  { keyword: "BMW model year by VIN", intent: "tool", volume: 1500, priority: 6, pageTargeting: "/bmw-model-year-lookup" },
  { keyword: "BMW country of manufacture VIN", intent: "informational", volume: 800, priority: 4 },
  { keyword: "BMW original colour from VIN", intent: "tool", volume: 1000, priority: 6, pageTargeting: "/bmw-paint-code-lookup" },
  { keyword: "BMW gearbox type by VIN", intent: "tool", volume: 900, priority: 5 },
  // Tier 5 — Informational
  { keyword: "how to read BMW VIN number", intent: "informational", volume: 5000, priority: 7, pageTargeting: "/guide/how-to-read-bmw-vin-number" },
  { keyword: "what does BMW VIN number mean", intent: "informational", volume: 3000, priority: 6, pageTargeting: "/guide/how-to-read-bmw-vin-number" },
  { keyword: "BMW VIN number explained", intent: "informational", volume: 2000, priority: 6, pageTargeting: "/guide/bmw-vin-structure-explained" },
  { keyword: "BMW VIN structure guide", intent: "informational", volume: 1500, priority: 5, pageTargeting: "/guide/bmw-vin-structure-explained" },
  { keyword: "where is BMW VIN number", intent: "informational", volume: 2500, priority: 6, pageTargeting: "/guide/where-to-find-vin-on-bmw" },
  { keyword: "how to find BMW VIN", intent: "informational", volume: 2000, priority: 6, pageTargeting: "/guide/where-to-find-vin-on-bmw" },
  { keyword: "BMW WMI codes", intent: "informational", volume: 600, priority: 4 },
  { keyword: "BMW production plant codes", intent: "informational", volume: 500, priority: 4 },
  { keyword: "BMW SA option codes complete guide", intent: "informational", volume: 1000, priority: 5, pageTargeting: "/guide/bmw-sa-option-codes-guide" },
  { keyword: "how to decode BMW build sheet", intent: "informational", volume: 800, priority: 5, pageTargeting: "/guide/how-to-find-bmw-build-sheet" },
  // Tier 6 — Buyer / pre-purchase
  { keyword: "BMW VIN check before buying", intent: "pre-purchase", volume: 2000, priority: 7, pageTargeting: "/guide/bmw-used-car-vin-check-buyers-guide" },
  { keyword: "BMW used car VIN check", intent: "pre-purchase", volume: 1500, priority: 7, pageTargeting: "/guide/bmw-used-car-vin-check-buyers-guide" },
  { keyword: "BMW history check by VIN", intent: "pre-purchase", volume: 1200, priority: 7, pageTargeting: "/guide/bmw-history-check-what-your-vin-reveals" },
  { keyword: "BMW stolen check VIN", intent: "pre-purchase", volume: 800, priority: 6, pageTargeting: "/guide/bmw-used-car-vin-check-buyers-guide" },
  { keyword: "BMW accident history VIN", intent: "pre-purchase", volume: 700, priority: 6, pageTargeting: "/guide/bmw-history-check-what-your-vin-reveals" },
  { keyword: "check BMW mileage by VIN", intent: "pre-purchase", volume: 1000, priority: 7, pageTargeting: "/guide/bmw-mileage-verification-by-vin" },
  { keyword: "BMW pre-purchase VIN check", intent: "pre-purchase", volume: 800, priority: 6, pageTargeting: "/guide/bmw-used-car-vin-check-buyers-guide" },
  // Tier 7 — Comparison
  { keyword: "best BMW VIN decoder", intent: "comparison", volume: 1500, priority: 6, pageTargeting: "/compare/best-bmw-vin-decoders" },
  { keyword: "BMW VIN decoder vs AutoCheck", intent: "comparison", volume: 500, priority: 4, pageTargeting: "/compare/best-bmw-vin-decoders" },
  { keyword: "BMW VIN decoder comparison", intent: "comparison", volume: 600, priority: 4, pageTargeting: "/compare/best-bmw-vin-decoders" },
];

// Guide content specifications for AI generation
const GUIDE_SPECS: Array<{
  slug: string;
  category: string;
  schemaType: string;
  intent: string;
  primaryKeyword: string;
  title: string;
  isBuyerGuide?: boolean;
  hasCarvertical?: boolean;
}> = [
  {
    slug: "how-to-read-bmw-vin-number",
    category: "informational",
    schemaType: "HowTo",
    intent: "informational",
    primaryKeyword: "how to read BMW VIN number",
    title: "How to Read a BMW VIN Number: Complete Guide (2026)",
  },
  {
    slug: "bmw-vin-structure-explained",
    category: "informational",
    schemaType: "Article",
    intent: "informational",
    primaryKeyword: "BMW VIN structure guide",
    title: "BMW VIN Structure Explained: Every Position Decoded",
  },
  {
    slug: "how-to-find-bmw-build-sheet",
    category: "informational",
    schemaType: "HowTo",
    intent: "informational",
    primaryKeyword: "how to decode BMW build sheet",
    title: "How to Find Your BMW Build Sheet for Free",
  },
  {
    slug: "what-does-bmw-vin-tell-you",
    category: "informational",
    schemaType: "Article",
    intent: "informational",
    primaryKeyword: "what does BMW VIN number mean",
    title: "What Does a BMW VIN Tell You? Full Breakdown",
  },
  {
    slug: "bmw-sa-option-codes-guide",
    category: "reference",
    schemaType: "Article",
    intent: "informational",
    primaryKeyword: "BMW SA option codes complete guide",
    title: "BMW SA Option Codes: Complete List and Guide",
  },
  {
    slug: "where-to-find-vin-on-bmw",
    category: "informational",
    schemaType: "HowTo",
    intent: "informational",
    primaryKeyword: "where is BMW VIN number",
    title: "Where to Find the VIN on Any BMW Model",
  },
  {
    slug: "bmw-used-car-vin-check-buyers-guide",
    category: "buyer-guide",
    schemaType: "Article",
    intent: "pre-purchase",
    primaryKeyword: "BMW VIN check before buying",
    title: "BMW Used Car VIN Check: Complete Buyer's Guide",
    isBuyerGuide: true,
    hasCarvertical: true,
  },
  {
    slug: "bmw-history-check-what-your-vin-reveals",
    category: "buyer-guide",
    schemaType: "Article",
    intent: "pre-purchase",
    primaryKeyword: "BMW history check by VIN",
    title: "BMW History Check: What Your VIN Reveals",
    isBuyerGuide: true,
    hasCarvertical: true,
  },
  {
    slug: "bmw-mileage-verification-by-vin",
    category: "buyer-guide",
    schemaType: "Article",
    intent: "pre-purchase",
    primaryKeyword: "check BMW mileage by VIN",
    title: "Mileage Verification by VIN: How It Works for BMW",
    isBuyerGuide: true,
    hasCarvertical: true,
  },
  {
    slug: "what-to-check-before-buying-used-bmw",
    category: "buyer-guide",
    schemaType: "Article",
    intent: "pre-purchase",
    primaryKeyword: "BMW pre-purchase VIN check",
    title: "What to Check Before Buying a Used BMW",
    isBuyerGuide: true,
    hasCarvertical: true,
  },
];

// ---------------------------------------------------------------------------
// 1. Keyword Discovery
// ---------------------------------------------------------------------------

/** Seed VIN-intent keywords + expand per-chassis from the cars table.
 *  Runs on the 24-hour cycle. Upserts into seo_keywords. */
export async function runKeywordDiscovery(): Promise<{ upserted: number; chassisExpanded: number }> {
  let upserted = 0;
  let chassisExpanded = 0;

  // 1a. Base seed patterns
  const seedRows: InsertSeoKeyword[] = VIN_INTENT_SEEDS.map(s => ({
    project: PROJECT,
    keyword: s.keyword,
    intent: s.intent,
    estimatedVolume: s.volume ?? null,
    priority: s.priority,
    pageTargeting: s.pageTargeting ?? null,
    clusterId: s.intent,
  }));

  for (const row of seedRows) {
    await db.execute(sql`
      INSERT INTO seo_keywords (project, keyword, intent, estimated_volume, priority, page_targeting, cluster_id)
      VALUES (${row.project}, ${row.keyword}, ${row.intent}, ${row.estimatedVolume ?? null}, ${row.priority}, ${row.pageTargeting ?? null}, ${row.clusterId ?? null})
      ON CONFLICT (keyword, project) DO UPDATE
        SET intent = EXCLUDED.intent,
            estimated_volume = EXCLUDED.estimated_volume,
            priority = EXCLUDED.priority,
            page_targeting = EXCLUDED.page_targeting,
            cluster_id = EXCLUDED.cluster_id,
            updated_at = NOW()
    `);
    upserted++;
  }

  // 1b. Per-chassis expansion: "BMW {chassis} VIN decoder" for each chassis code
  const chassisResult = await db.execute(sql`
    SELECT DISTINCT UPPER(chassis) AS chassis FROM cars
    WHERE chassis IS NOT NULL AND chassis <> ''
    ORDER BY chassis
  `);
  const chassisCodes = (chassisResult.rows as { chassis: string }[]).map(r => r.chassis);

  for (const chassis of chassisCodes) {
    const keyword = `BMW ${chassis} VIN decoder`;
    const pageTargeting = `/bmw-${chassis.toLowerCase()}-vin-decoder`;
    await db.execute(sql`
      INSERT INTO seo_keywords (project, keyword, intent, estimated_volume, priority, page_targeting, cluster_id)
      VALUES (${PROJECT}, ${keyword}, ${'model-specific'}, NULL, 5, ${pageTargeting}, ${'model-specific'})
      ON CONFLICT (keyword, project) DO UPDATE
        SET page_targeting = EXCLUDED.page_targeting,
            updated_at = NOW()
    `);
    chassisExpanded++;
  }

  console.log(`[seo-engine] keyword discovery: ${upserted} seed kws, ${chassisExpanded} chassis expansions`);
  return { upserted, chassisExpanded };
}

// ---------------------------------------------------------------------------
// 2. Content Page Registry
// ---------------------------------------------------------------------------

/** Register a programmatic page in seo_content_pages so it appears in the
 *  admin dashboard and is eligible for 90-day refresh scheduling. */
export async function registerContentPage(opts: {
  url: string;
  pageType: string;
  primaryKeyword?: string;
  wordCount?: number;
  contentRef?: string;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO seo_content_pages (project, url, page_type, primary_keyword, word_count, content_ref)
    VALUES (${PROJECT}, ${opts.url}, ${opts.pageType}, ${opts.primaryKeyword ?? null}, ${opts.wordCount ?? null}, ${opts.contentRef ?? null})
    ON CONFLICT (url, project) DO UPDATE
      SET primary_keyword = COALESCE(EXCLUDED.primary_keyword, seo_content_pages.primary_keyword),
          word_count = COALESCE(EXCLUDED.word_count, seo_content_pages.word_count),
          content_ref = COALESCE(EXCLUDED.content_ref, seo_content_pages.content_ref),
          last_refreshed_at = NOW()
  `);
}

/** Register all programmatic VIN tool pages (Template A) and statistics pages (Template F). */
export async function registerStaticPages(): Promise<void> {
  const toolPages = [
    { url: "/bmw-vin-decoder", keyword: "BMW VIN decoder", ref: "bmw-vin-decoder" },
    { url: "/bmw-build-sheet-lookup", keyword: "BMW build sheet by VIN", ref: "bmw-build-sheet-lookup" },
    { url: "/bmw-paint-code-lookup", keyword: "BMW paint code by VIN", ref: "bmw-paint-code-lookup" },
    { url: "/bmw-production-date-lookup", keyword: "BMW production date by VIN", ref: "bmw-production-date-lookup" },
    { url: "/bmw-engine-code-lookup", keyword: "BMW engine code by VIN", ref: "bmw-engine-code-lookup" },
    { url: "/bmw-options-lookup", keyword: "BMW options by VIN", ref: "bmw-options-lookup" },
    { url: "/bmw-plant-code-lookup", keyword: "BMW plant code lookup", ref: "bmw-plant-code-lookup" },
    { url: "/bmw-model-year-lookup", keyword: "BMW model year by VIN", ref: "bmw-model-year-lookup" },
  ];
  for (const p of toolPages) {
    await registerContentPage({ url: p.url, pageType: "tool", primaryKeyword: p.keyword, contentRef: p.ref });
  }

  const statsPages = [
    { url: "/data/most-popular-bmw-options", keyword: "most popular BMW options", ref: "most-popular-bmw-options" },
    { url: "/data/most-common-bmw-paint-colours", keyword: "most common BMW paint colours", ref: "most-common-bmw-paint-colours" },
    { url: "/data/bmw-production-plant-stats", keyword: "BMW production plant statistics", ref: "bmw-production-plant-stats" },
    { url: "/data/most-decoded-bmw-chassis", keyword: "most decoded BMW chassis", ref: "most-decoded-bmw-chassis" },
  ];
  for (const p of statsPages) {
    await registerContentPage({ url: p.url, pageType: "statistics", primaryKeyword: p.keyword, contentRef: p.ref });
  }

  const comparePages = [
    { url: "/compare/best-bmw-vin-decoders", keyword: "best BMW VIN decoder", ref: "best-bmw-vin-decoders" },
    { url: "/compare/bmv-vin-vs-vindecoderz", keyword: "BMW VIN decoder vs VINDecoderZ", ref: "bmv-vin-vs-vindecoderz" },
    { url: "/compare/free-vs-paid-bmw-vin-check", keyword: "free vs paid BMW VIN check", ref: "free-vs-paid-bmw-vin-check" },
  ];
  for (const p of comparePages) {
    await registerContentPage({ url: p.url, pageType: "comparison", primaryKeyword: p.keyword, contentRef: p.ref });
  }

  // Register model VIN pages
  const chassisResult = await db.execute(sql`
    SELECT DISTINCT UPPER(chassis) AS chassis FROM cars
    WHERE chassis IS NOT NULL AND chassis <> ''
    ORDER BY chassis
  `);
  for (const row of chassisResult.rows as { chassis: string }[]) {
    const chassis = row.chassis;
    await registerContentPage({
      url: `/bmw-${chassis.toLowerCase()}-vin-decoder`,
      pageType: "model",
      primaryKeyword: `BMW ${chassis} VIN decoder`,
      contentRef: chassis,
    });
  }
}

// ---------------------------------------------------------------------------
// 3. AI Content Engine — Guide Generation
// ---------------------------------------------------------------------------

function buildGuidePrompt(spec: typeof GUIDE_SPECS[0]): string {
  const guideType = spec.isBuyerGuide ? "buyer guide" : spec.schemaType === "HowTo" ? "how-to guide" : "informational article";
  return `You are an expert BMW technical writer creating SEO-optimised content for bmv.vin, the definitive BMW VIN decoder website.

Write a ${guideType} titled: "${spec.title}"

PRIMARY KEYWORD: "${spec.primaryKeyword}"

STRUCTURE REQUIREMENTS (must follow exactly):
1. Quick Answer Box (2-3 sentences, direct answer optimised for Google AI Overview / Featured Snippet extraction)
2. Introduction (2-3 paragraphs, 150-200 words)
3. 5-7 H2 sections with detailed content (200-400 words each)
${spec.schemaType === "HowTo" ? "4. Step-by-step numbered instructions (HowTo schema)" : ""}
5. FAQ section with 8-10 questions and answers
${spec.hasCarvertical ? "6. A section recommending Carvertical for mileage/history verification" : ""}
7. Conclusion with CTA to use bmv.vin VIN decoder

GEO OPTIMISATION (include all of these):
- WHAT: Clear definition of the topic
- WHY: Why this matters to BMW owners/buyers
- HOW: Step-by-step process
- COST: Free vs paid options
- ALTERNATIVES: Other methods or tools
- COMMON PROBLEMS: What can go wrong

BRAND VOICE: Authoritative, informative, helpful. Speaks to BMW enthusiasts, mechanics, and buyers.

INTERNAL LINKS TO INCLUDE: Reference bmv.vin for all VIN decoding, link to relevant tools.

WORD COUNT: ${spec.isBuyerGuide ? "2,000-4,000" : "1,500-3,000"} words

Return ONLY a JSON object with this exact structure:
{
  "summary": "2-3 sentence quick answer box",
  "body": "full article body in markdown",
  "faq": [{"q": "question", "a": "answer"}, ...],
  "steps": ${spec.schemaType === "HowTo" ? '[{"name": "Step name", "text": "Step description"}, ...]' : "[]"},
  "metaTitle": "SEO title tag (max 60 chars)",
  "metaDescription": "SEO meta description (max 155 chars)"
}`;
}

/** Generate and save a single guide using GPT-5.
 *  Returns the guide slug on success. */
async function generateGuide(spec: typeof GUIDE_SPECS[0]): Promise<string | null> {
  if (process.env.BMV_DISABLE_SEO_ENGINES === "1") {
    console.log(`[seo-engine] BMV_DISABLE_SEO_ENGINES is active — guide generation suppressed for "${spec.slug}"`);
    return null;
  }

  // Check if guide already exists with content
  const existing = await db.execute(sql`
    SELECT id, body FROM bmv_vin_guide WHERE slug = ${spec.slug}
  `);
  const existingRow = (existing.rows as { id: number; body: unknown }[])[0];
  if (existingRow) {
    const bodyObj = existingRow.body as Record<string, unknown> | null;
    const hasContent = bodyObj && typeof bodyObj.en === "string" && bodyObj.en.length > 500;
    if (hasContent) {
      console.log(`[seo-engine] guide "${spec.slug}" already has content, skipping`);
      return spec.slug;
    }
  }

  console.log(`[seo-engine] generating guide: ${spec.slug}`);

  let parsed: {
    summary: string;
    body: string;
    faq: { q: string; a: string }[];
    steps: { name: string; text: string }[];
    metaTitle: string;
    metaDescription: string;
  };

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: buildGuidePrompt(spec) }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
    });
    const raw = resp.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty AI response");
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`[seo-engine] guide generation failed for "${spec.slug}":`, err);
    return null;
  }

  // Build locale-keyed JSONB objects
  const localise = (v: string) => ({ en: v });
  const localiseFaq = (faq: { q: string; a: string }[]) =>
    faq.map(f => ({ q: { en: f.q }, a: { en: f.a } }));
  const localiseSteps = (steps: { name: string; text: string }[]) =>
    steps.map(s => ({ name: { en: s.name }, text: { en: s.text } }));

  // Append Carvertical CTA on buyer-intent guides
  let bodyContent = parsed.body || "";
  if (spec.hasCarvertical) {
    bodyContent += `\n\n## Verify BMW Mileage & History with Carvertical\n\nBefore completing any BMW purchase, we strongly recommend running a [Carvertical check](https://www.carvertical.com/lp/start?a=69ed8f8d0e46e&b=aa3269f9&chan=bmvparts&voucher=bmv) to verify mileage history, accident records, and ownership history. Use voucher code **BMV** for a discount.\n`;
  }

  const now = new Date();
  const guideData: InsertBmvVinGuide = {
    slug: spec.slug,
    schemaType: spec.schemaType,
    category: spec.category,
    title: localise(spec.title),
    summary: localise(parsed.summary || ""),
    body: localise(bodyContent),
    faq: localiseFaq(Array.isArray(parsed.faq) ? parsed.faq.slice(0, 10) : []),
    metaTitle: localise(parsed.metaTitle || spec.title),
    metaDescription: localise(parsed.metaDescription || ""),
    steps: localiseSteps(Array.isArray(parsed.steps) ? parsed.steps : []),
    relatedSlugs: [],
    published: true,
  };

  if (existingRow) {
    await db.execute(sql`
      UPDATE bmv_vin_guide
      SET title = ${guideData.title}::jsonb,
          summary = ${guideData.summary}::jsonb,
          body = ${guideData.body}::jsonb,
          faq = ${JSON.stringify(guideData.faq)}::jsonb,
          meta_title = ${guideData.metaTitle}::jsonb,
          meta_description = ${guideData.metaDescription}::jsonb,
          steps = ${JSON.stringify(guideData.steps)}::jsonb,
          schema_type = ${guideData.schemaType},
          category = ${guideData.category},
          published = true,
          updated_at = NOW()
      WHERE slug = ${spec.slug}
    `);
  } else {
    await db.execute(sql`
      INSERT INTO bmv_vin_guide (slug, schema_type, category, title, summary, body, faq, meta_title, meta_description, steps, related_slugs, published, published_at, updated_at)
      VALUES (
        ${spec.slug},
        ${guideData.schemaType},
        ${guideData.category},
        ${guideData.title}::jsonb,
        ${guideData.summary}::jsonb,
        ${guideData.body}::jsonb,
        ${JSON.stringify(guideData.faq)}::jsonb,
        ${guideData.metaTitle}::jsonb,
        ${guideData.metaDescription}::jsonb,
        ${JSON.stringify(guideData.steps)}::jsonb,
        ARRAY[]::text[],
        true,
        NOW(),
        NOW()
      )
      ON CONFLICT (slug) DO UPDATE
        SET title = EXCLUDED.title,
            summary = EXCLUDED.summary,
            body = EXCLUDED.body,
            faq = EXCLUDED.faq,
            meta_title = EXCLUDED.meta_title,
            meta_description = EXCLUDED.meta_description,
            steps = EXCLUDED.steps,
            updated_at = NOW()
    `);
  }

  // Register in content pages
  await registerContentPage({
    url: `/guide/${spec.slug}`,
    pageType: spec.isBuyerGuide ? "buyer-guide" : spec.schemaType === "HowTo" ? "guide" : "guide",
    primaryKeyword: spec.primaryKeyword,
    wordCount: Math.round((bodyContent.split(/\s+/).length)),
    contentRef: spec.slug,
  });

  // Schedule 90-day refresh
  await scheduleRefresh(`/guide/${spec.slug}`, 90);

  console.log(`[seo-engine] guide "${spec.slug}" generated and saved`);
  return spec.slug;
}

/** Run AI content generation for all guides that lack content.
 *  Limits to `batchSize` per run to avoid blowing AI token budget. */
export async function runContentGeneration(batchSize = 3): Promise<{ generated: string[]; failed: string[] }> {
  const generated: string[] = [];
  const failed: string[] = [];
  let count = 0;

  for (const spec of GUIDE_SPECS) {
    if (count >= batchSize) break;
    const slug = await generateGuide(spec);
    if (slug) {
      generated.push(slug);
    } else {
      failed.push(spec.slug);
    }
    count++;
  }

  return { generated, failed };
}

// ---------------------------------------------------------------------------
// 4. 90-Day Refresh Engine
// ---------------------------------------------------------------------------

/** Add a page to the refresh queue, due in `daysFromNow` days. */
export async function scheduleRefresh(url: string, daysFromNow = 90): Promise<void> {
  // Resolve page_id
  const page = await db.execute(sql`
    SELECT id FROM seo_content_pages WHERE url = ${url} AND project = ${PROJECT}
  `);
  const pageRow = (page.rows as { id: number }[])[0];
  if (!pageRow) return;

  const dueAt = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  await db.execute(sql`
    INSERT INTO seo_refresh_queue (page_id, due_at, status, priority)
    VALUES (${pageRow.id}, ${dueAt.toISOString()}, 'pending', 1)
    ON CONFLICT DO NOTHING
  `);
}

/** Process the refresh queue — regenerate content for pages past their due date.
 *  Limits to `batchSize` per run. */
export async function runRefreshEngine(batchSize = 2): Promise<{ refreshed: number; failed: number }> {
  let refreshed = 0;
  let failed = 0;

  const due = await db.execute(sql`
    SELECT q.id AS queue_id, p.url, p.content_ref, p.page_type
    FROM seo_refresh_queue q
    JOIN seo_content_pages p ON p.id = q.page_id
    WHERE q.status = 'pending' AND q.due_at <= NOW()
    ORDER BY q.priority DESC, q.due_at ASC
    LIMIT ${batchSize}
  `);

  for (const row of due.rows as { queue_id: number; url: string; content_ref: string; page_type: string }[]) {
    // Mark as running
    await db.execute(sql`
      UPDATE seo_refresh_queue SET status = 'running', last_attempt_at = NOW(), attempts = attempts + 1
      WHERE id = ${row.queue_id}
    `);

    let ok = false;
    try {
      if (row.page_type === "guide" || row.page_type === "buyer-guide") {
        const spec = GUIDE_SPECS.find(s => s.slug === row.content_ref);
        if (spec) {
          // Force re-generation by clearing body
          await db.execute(sql`
            UPDATE bmv_vin_guide SET body = '{}'::jsonb WHERE slug = ${spec.slug}
          `);
          const slug = await generateGuide(spec);
          ok = !!slug;
        }
      }
      // Tool and model pages are static SSR — update last_refreshed_at
      if (row.page_type === "tool" || row.page_type === "model" || row.page_type === "statistics") {
        await db.execute(sql`
          UPDATE seo_content_pages SET last_refreshed_at = NOW()
          WHERE url = ${row.url} AND project = ${PROJECT}
        `);
        ok = true;
      }
    } catch (err) {
      console.error(`[seo-engine] refresh failed for ${row.url}:`, err);
    }

    // Update queue status
    if (ok) {
      await db.execute(sql`
        UPDATE seo_refresh_queue SET status = 'done', completed_at = NOW() WHERE id = ${row.queue_id}
      `);
      // Re-queue for next 90-day cycle
      await scheduleRefresh(row.url, 90);
      refreshed++;
    } else {
      await db.execute(sql`
        UPDATE seo_refresh_queue SET status = 'failed' WHERE id = ${row.queue_id}
      `);
      failed++;
    }
  }

  return { refreshed, failed };
}

// ---------------------------------------------------------------------------
// 5. Internal Linking Engine
// ---------------------------------------------------------------------------

/** After guides are generated, ensure cross-linking between related slugs. */
export async function runInternalLinking(): Promise<void> {
  // Link how-to guides to the VIN decoder tool
  const linksMap: Record<string, string[]> = {
    "how-to-read-bmw-vin-number": ["bmw-vin-structure-explained", "where-to-find-vin-on-bmw"],
    "bmw-vin-structure-explained": ["how-to-read-bmw-vin-number", "bmw-sa-option-codes-guide"],
    "how-to-find-bmw-build-sheet": ["what-does-bmw-vin-tell-you", "bmw-sa-option-codes-guide"],
    "what-does-bmw-vin-tell-you": ["how-to-read-bmw-vin-number", "how-to-find-bmw-build-sheet"],
    "bmw-sa-option-codes-guide": ["how-to-find-bmw-build-sheet", "what-does-bmw-vin-tell-you"],
    "where-to-find-vin-on-bmw": ["how-to-read-bmw-vin-number"],
    "bmw-used-car-vin-check-buyers-guide": ["bmw-history-check-what-your-vin-reveals", "bmw-mileage-verification-by-vin", "what-to-check-before-buying-used-bmw"],
    "bmw-history-check-what-your-vin-reveals": ["bmw-used-car-vin-check-buyers-guide", "bmw-mileage-verification-by-vin"],
    "bmw-mileage-verification-by-vin": ["bmw-used-car-vin-check-buyers-guide", "bmw-history-check-what-your-vin-reveals"],
    "what-to-check-before-buying-used-bmw": ["bmw-used-car-vin-check-buyers-guide", "bmw-history-check-what-your-vin-reveals"],
  };

  for (const [slug, relatedSlugs] of Object.entries(linksMap)) {
    await db.execute(sql`
      UPDATE bmv_vin_guide
      SET related_slugs = ${relatedSlugs}::text[],
          updated_at = NOW()
      WHERE slug = ${slug}
    `).catch(() => null); // Ignore if guide doesn't exist yet
  }

  console.log(`[seo-engine] internal linking updated for ${Object.keys(linksMap).length} guides`);
}

// ---------------------------------------------------------------------------
// 6. Dashboard stats
// ---------------------------------------------------------------------------

export interface SeoGrowthStats {
  totalKeywords: number;
  keywordsByIntent: Record<string, number>;
  totalPages: number;
  pagesByType: Record<string, number>;
  pendingRefreshes: number;
  overdueRefreshes: number;
  publishedGuides: number;
  recentlyGeneratedGuides: number;
}

export async function getSeoGrowthStats(): Promise<SeoGrowthStats> {
  const [kwTotal, kwByIntent, pgTotal, pgByType, queueStats, guideStats] = await Promise.all([
    db.execute(sql`SELECT COUNT(*)::int AS c FROM seo_keywords WHERE project = ${PROJECT}`),
    db.execute(sql`SELECT intent, COUNT(*)::int AS c FROM seo_keywords WHERE project = ${PROJECT} GROUP BY intent`),
    db.execute(sql`SELECT COUNT(*)::int AS c FROM seo_content_pages WHERE project = ${PROJECT}`),
    db.execute(sql`SELECT page_type, COUNT(*)::int AS c FROM seo_content_pages WHERE project = ${PROJECT} GROUP BY page_type`),
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'pending' AND due_at <= NOW())::int AS overdue
      FROM seo_refresh_queue q
      JOIN seo_content_pages p ON p.id = q.page_id
      WHERE p.project = ${PROJECT}
    `),
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE published = true)::int AS published,
        COUNT(*) FILTER (WHERE published = true AND updated_at > NOW() - INTERVAL '7 days')::int AS recent
      FROM bmv_vin_guide
    `),
  ]);

  const kwByIntentMap: Record<string, number> = {};
  for (const row of (kwByIntent.rows as { intent: string; c: number }[])) {
    kwByIntentMap[row.intent] = row.c;
  }
  const pgByTypeMap: Record<string, number> = {};
  for (const row of (pgByType.rows as { page_type: string; c: number }[])) {
    pgByTypeMap[row.page_type] = row.c;
  }
  const qs = (queueStats.rows as { pending: number; overdue: number }[])[0] ?? { pending: 0, overdue: 0 };
  const gs = (guideStats.rows as { published: number; recent: number }[])[0] ?? { published: 0, recent: 0 };

  return {
    totalKeywords: ((kwTotal.rows as { c: number }[])[0]?.c ?? 0),
    keywordsByIntent: kwByIntentMap,
    totalPages: ((pgTotal.rows as { c: number }[])[0]?.c ?? 0),
    pagesByType: pgByTypeMap,
    pendingRefreshes: qs.pending,
    overdueRefreshes: qs.overdue,
    publishedGuides: gs.published,
    recentlyGeneratedGuides: gs.recent,
  };
}

export async function getTopKeywords(limit = 20): Promise<Array<{ keyword: string; intent: string; volume: number | null; priority: number; pageTargeting: string | null }>> {
  const rs = await db.execute(sql`
    SELECT keyword, intent, estimated_volume, priority, page_targeting
    FROM seo_keywords
    WHERE project = ${PROJECT}
    ORDER BY priority DESC, estimated_volume DESC NULLS LAST
    LIMIT ${limit}
  `);
  return (rs.rows as { keyword: string; intent: string; estimated_volume: number | null; priority: number; page_targeting: string | null }[])
    .map(r => ({
      keyword: r.keyword,
      intent: r.intent,
      volume: r.estimated_volume,
      priority: r.priority,
      pageTargeting: r.page_targeting,
    }));
}

export async function getRefreshQueue(limit = 20): Promise<Array<{ url: string; pageType: string; dueAt: string; status: string; attempts: number }>> {
  const rs = await db.execute(sql`
    SELECT p.url, p.page_type, q.due_at, q.status, q.attempts
    FROM seo_refresh_queue q
    JOIN seo_content_pages p ON p.id = q.page_id
    WHERE p.project = ${PROJECT} AND q.status IN ('pending', 'failed')
    ORDER BY q.due_at ASC
    LIMIT ${limit}
  `);
  return (rs.rows as { url: string; page_type: string; due_at: string; status: string; attempts: number }[])
    .map(r => ({ url: r.url, pageType: r.page_type, dueAt: r.due_at, status: r.status, attempts: r.attempts }));
}

// ---------------------------------------------------------------------------
// 7. Scheduler — called from server/index.ts on startup
// ---------------------------------------------------------------------------
let _schedulerStarted = false;

export function initSeoGrowthEngine(): void {
  if (_schedulerStarted) return;
  _schedulerStarted = true;

  // Run initial setup asynchronously so server startup is not blocked
  setTimeout(async () => {
    try {
      await registerStaticPages();
      console.log("[seo-engine] static pages registered");
    } catch (err) {
      console.error("[seo-engine] registerStaticPages error:", err);
    }
  }, 15_000); // 15s delay after startup

  // 24-hour keyword discovery cycle
  const runDailyJobs = async () => {
    try {
      const { upserted, chassisExpanded } = await runKeywordDiscovery();
      console.log(`[seo-engine] daily keyword discovery complete: ${upserted} kws, ${chassisExpanded} chassis`);
    } catch (err) {
      console.error("[seo-engine] daily keyword discovery failed:", err);
    }
  };

  // Initial run after 30s, then every 24h
  setTimeout(runDailyJobs, 30_000);
  setInterval(runDailyJobs, 24 * 60 * 60 * 1000);

  // 90-day refresh: check queue every 6 hours
  const runRefreshCheck = async () => {
    try {
      const result = await runRefreshEngine(1);
      if (result.refreshed > 0 || result.failed > 0) {
        console.log(`[seo-engine] refresh cycle: ${result.refreshed} refreshed, ${result.failed} failed`);
      }
    } catch (err) {
      console.error("[seo-engine] refresh engine error:", err);
    }
  };
  setInterval(runRefreshCheck, 6 * 60 * 60 * 1000);

  console.log("[seo-engine] SEO growth engine initialized (bmv.vin)");
}
