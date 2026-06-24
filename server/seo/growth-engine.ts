/**
 * BMV.parts SEO Growth Engine
 *
 * Modules:
 *  1. Keyword Engine  — seeds seo_keywords from catalog; classifies intent; 24h cycle
 *  2. Content Engine  — GPT-5-powered article generation for guides/compare/data pages
 *  3. Refresh Engine  — 90-day scheduler re-queues stale content pages
 *  4. Internal Linking — after generation, injects hub→spoke / spoke→hub anchors
 *
 * All DB writes use the raw `db` pool (not storage) to avoid coupling
 * to IStorage — this module is a background worker, not a request handler.
 */

import { db } from "../storage";
import { sql } from "drizzle-orm";
import OpenAI from "openai";
import { cars as carsTable, categories as categoriesTable } from "@shared/schema";
import { eq } from "drizzle-orm";
import { loggedChatCompletion } from "../openai-logger";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------
export type ContentPageType = "guide" | "compare" | "data" | "chassis_part";
export type KeywordIntent = "commercial" | "transactional" | "informational" | "comparison" | "how_to" | "part_number" | "repair_guide";

export interface SeoKeyword {
  id: number;
  keyword: string;
  intent: KeywordIntent;
  volumeEst: number;
  difficulty: number;
  cpcUsd: number;
  priority: number;
  pageTargeting: string | null;
  createdAt: Date;
}

export interface SeoContentPage {
  id: number;
  slug: string;
  pageType: ContentPageType;
  primaryKeyword: string;
  title: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  wordCount: number;
  generatedAt: Date;
  lastRefreshedAt: Date | null;
  indexed: boolean;
}

// ---------------------------------------------------------------------------
// Intent Classification
// ---------------------------------------------------------------------------
const INTENT_SIGNALS: Record<KeywordIntent, RegExp> = {
  comparison:   /\bvs\.?\b|\bversus\b|\bdifference\b|\bbetter\b|\bcompare\b/i,
  how_to:       /\bhow to\b|\bdiy\b|\binstall\b|\breplace\b|\bremoval\b/i,
  repair_guide: /\brepair\b|\bfix\b|\bbroken\b|\bdamaged\b/i,
  part_number:  /\b\d{5,}\b|oem\s+\d|genuine\s+\d/i,
  transactional:/\bpart number\b|\boem\b|\bgenuine\b|\border\b/i,
  commercial:   /\bbuy\b|\bfor sale\b|\bprice\b|\bcost\b|\bcheap\b|\bshop\b/i,
  informational:/\bwhat is\b|\bwhat are\b|\bguide\b|\bexplained?\b|\bwhy\b|\bcommon problems?\b/i,
};

function classifyIntent(keyword: string): KeywordIntent {
  for (const [intent, pattern] of Object.entries(INTENT_SIGNALS)) {
    if (pattern.test(keyword)) return intent as KeywordIntent;
  }
  return "informational";
}

function scorePriority(intent: KeywordIntent, volumeEst: number, difficulty: number): number {
  const intentWeight: Record<KeywordIntent, number> = {
    commercial: 10, transactional: 9, comparison: 8,
    repair_guide: 7, how_to: 6, informational: 5, part_number: 4,
  };
  const base = intentWeight[intent] ?? 5;
  const volScore = Math.min(volumeEst / 1000, 10);
  const diffPenalty = difficulty / 20;
  return Math.round((base + volScore - diffPenalty) * 10) / 10;
}

// ---------------------------------------------------------------------------
// 1. Keyword Engine
// ---------------------------------------------------------------------------
export async function seedKeywordsFromCatalog(): Promise<{ seeded: number; skipped: number }> {
  // Pull distinct chassis, series, and category names from the catalog
  const chassisRows = await db.execute<{ chassis: string }>(sql`
    SELECT DISTINCT chassis FROM cars WHERE chassis IS NOT NULL AND chassis <> '' ORDER BY chassis
  `);
  const seriesRows = await db.execute<{ series: string }>(sql`
    SELECT DISTINCT series FROM cars WHERE series IS NOT NULL AND series <> '' ORDER BY series
  `);
  const categoryRows = await db.execute<{ name: string }>(sql`
    SELECT DISTINCT LOWER(name) AS name FROM categories ORDER BY name LIMIT 200
  `);

  const chassis = chassisRows.rows.map((r: any) => r.chassis as string);
  const series = seriesRows.rows.map((r: any) => r.series as string);
  const categories = categoryRows.rows.map((r: any) => r.name as string);

  // Canonical part categories to use in keyword matrix
  const partCats = [
    "front bumper", "rear bumper", "bonnet", "boot lid", "door panel",
    "headlight", "tail light", "engine", "gearbox", "exhaust",
    "suspension", "brake pads", "brake discs", "radiator", "alternator",
    "fuel pump", "water pump", "timing chain", "turbocharger", "intercooler",
    "steering rack", "wheel bearing", "cv joint", "driveshaft", "seat",
    "dashboard", "airbag", "catalytic converter", "oil cooler", "differential",
    "control arm", "subframe", "door mirror", "roof panel", "sill panel",
  ];

  // Buyer guide topics
  const guideTopics = chassis.slice(0, 30).map(c => `BMW ${c} buying guide`);
  const commonProblems = chassis.slice(0, 30).map(c => `BMW ${c} common problems`);
  const comparisons = [
    "BMW G80 M3 vs G82 M4 parts", "BMW F80 vs G80 M3 parts",
    "BMW OEM parts vs aftermarket", "genuine BMW parts vs pattern parts",
    "new BMW parts vs used BMW parts",
  ];
  const authority = [
    "most expensive BMW parts", "cheapest BMW parts online",
    "BMW parts price index 2026", "average BMW repair cost",
    "most common BMW faults",
  ];
  const howTo = [
    "how to find BMW part number", "how to use BMW parts catalog",
    "how to check BMW part compatibility", "how to order genuine BMW parts",
    "how to identify BMW chassis codes",
  ];

  // Build full keyword list
  const keywords: string[] = [
    // Tier 1
    "BMW parts", "BMW OEM parts", "BMW genuine parts", "BMW parts catalog",
    "BMW parts lookup", "BMW parts online", "BMW parts Australia",
    "BMW parts USA", "BMW parts UK",
    // Tier 2: series
    ...series.map(s => `BMW ${s} parts`),
    // Tier 3: chassis
    ...chassis.map(c => `BMW ${c} parts`),
    ...chassis.map(c => `BMW ${c} for sale`),
    // Tier 4: chassis × part
    ...chassis.slice(0, 20).flatMap(c =>
      partCats.slice(0, 12).map(p => `BMW ${c} ${p}`)
    ),
    // Tier 6: guides
    ...guideTopics, ...commonProblems,
    // Tier 7: comparisons
    ...comparisons,
    // Authority
    ...authority, ...howTo,
    // Category-level
    ...categories.slice(0, 50).map(cat => `BMW ${cat} parts`),
  ];

  let seeded = 0;
  let skipped = 0;

  for (const keyword of keywords) {
    const intent = classifyIntent(keyword);
    // Estimate volume heuristically (will be updated by external API when available)
    const volEst = keyword.includes("BMW parts") ? 5000
      : chassis.some(c => keyword.includes(c)) && !keyword.includes(" ") ? 2000
      : keyword.split(" ").length <= 3 ? 1500
      : 500;
    const difficulty = keyword.split(" ").length <= 2 ? 60 : 35;
    const priority = scorePriority(intent, volEst, difficulty);

    try {
      await db.execute(sql`
        INSERT INTO seo_keywords (keyword, intent, volume_est, difficulty, cpc_usd, priority, page_targeting)
        VALUES (${keyword}, ${intent}, ${volEst}, ${difficulty}, ${0.5}, ${priority}, NULL)
        ON CONFLICT (keyword) DO NOTHING
      `);
      seeded++;
    } catch {
      skipped++;
    }
  }

  return { seeded, skipped };
}

// ---------------------------------------------------------------------------
// 2. Content Engine
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

async function generateGuideContent(keyword: string, chassis?: string): Promise<{
  title: string; content: string; metaTitle: string; metaDescription: string;
}> {
  if (process.env.BMV_DISABLE_SEO_ENGINES === "1") {
    throw new Error("[seo-scheduler] BMV_DISABLE_SEO_ENGINES is active — guide generation suppressed");
  }
  const prompt = `You are an expert BMW mechanic and automotive writer creating SEO-optimised content for bmv.parts.

Write a comprehensive buyer guide article about: "${keyword}"

STRUCTURE (follow exactly):
---
TITLE: [Exact H1 title — primary keyword exact/close match]

META_TITLE: [Under 60 chars — include chassis/model + key term + | BMV.parts]

META_DESCRIPTION: [Under 155 chars — include primary keyword + clear CTA]

CONTENT:
## Quick Answer
[2–3 sentences answering the core question directly — AI Overview bait]

## Introduction
[150–200 words. Primary keyword in first 100 words. Technical authority tone.]

## [Section 1: e.g. What is the [Part/Topic]?]
[300–400 words]

## [Section 2: e.g. Common Problems / Failure Modes]
[300–400 words with specific technical details]

## [Section 3: e.g. OEM vs Aftermarket Options]
[250–350 words]

## [Section 4: e.g. Cost & Pricing Guide]
[200–300 words with realistic price ranges]

## [Section 5: e.g. How to Find the Right BMW Part Number]
[200–300 words — step-by-step]

## [Section 6: e.g. Frequently Asked Questions]
Q: [Question 1 — common search query phrasing]
A: [40–80 word direct answer]

Q: [Question 2]
A: [40–80 word answer]

Q: [Question 3]
A: [Answer]

Q: [Question 4]
A: [Answer]

Q: [Question 5]
A: [Answer]

Q: [Question 6]
A: [Answer]

Q: [Question 7]
A: [Answer]

Q: [Question 8]
A: [Answer]

## Related Parts & Resources
- [Internal link text 1]
- [Internal link text 2]
- [Internal link text 3]
- [Internal link text 4]
- [Internal link text 5]

## Get a Quote on BMV.parts
[2–3 sentence CTA linking to bmv.parts for part lookup, VIN decoder, and pricing]
---

Rules:
- Write 1,500–3,000 words total
- Use technical authority tone — speak to both mechanics and enthusiasts
- Include specific BMW chassis codes (E46, F80, G80, etc.) where relevant
- Reference realistic OEM part pricing in AUD/USD
- Include the Quick Answer box for AI Overview optimisation
- All FAQ answers must be direct and complete on their own
${chassis ? `- Focus specifically on the ${chassis} chassis` : ""}`;

  const completion = await loggedChatCompletion(openai, "growth-engine", {
    model: "gpt-5",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 3000,
    temperature: 0.7,
  });

  const raw = completion.choices[0].message.content || "";

  // Parse structured sections
  const titleMatch = raw.match(/^TITLE:\s*(.+)$/m);
  const metaTitleMatch = raw.match(/^META_TITLE:\s*(.+)$/m);
  const metaDescMatch = raw.match(/^META_DESCRIPTION:\s*(.+)$/m);
  const contentMatch = raw.match(/CONTENT:\n([\s\S]+)/m);

  const title = titleMatch?.[1]?.trim() || keyword;
  const metaTitle = metaTitleMatch?.[1]?.trim() || `${title} | BMV.parts`;
  const metaDescription = metaDescMatch?.[1]?.trim() || `Expert guide to ${keyword} — OEM part numbers, pricing, and fitment on BMV.parts.`;
  const content = contentMatch?.[1]?.trim() || raw;

  return { title, content, metaTitle, metaDescription };
}

async function generateComparisonContent(subject: string): Promise<{
  title: string; content: string; metaTitle: string; metaDescription: string;
}> {
  if (process.env.BMV_DISABLE_SEO_ENGINES === "1") {
    throw new Error("[seo-scheduler] BMV_DISABLE_SEO_ENGINES is active — comparison generation suppressed");
  }
  const prompt = `You are an expert BMW mechanic and automotive writer for bmv.parts.

Write a comprehensive comparison article about: "${subject}"

STRUCTURE:
---
TITLE: [H1 title — primary keyword, includes both subjects]

META_TITLE: [Under 60 chars]

META_DESCRIPTION: [Under 155 chars]

CONTENT:
## Quick Verdict
[3–4 sentences giving the direct comparison answer — AI Overview bait. Start with the key difference immediately.]

## Introduction
[150–200 words]

## Key Differences at a Glance
[Comparison table or bullet list of 5–8 key differences]

## Parts Compatibility
[300–400 words — which parts interchange, which don't, with specific part numbers where known]

## Cost Comparison
[200–300 words — OEM pricing differences between the two models/options in AUD/USD]

## Which Should You Choose?
[200–250 words — clear recommendation based on use case]

## Frequently Asked Questions
Q: [Question 1]
A: [40–80 word direct answer]

Q: [Question 2]
A: [Answer]

Q: [Question 3]
A: [Answer]

Q: [Question 4]
A: [Answer]

Q: [Question 5]
A: [Answer]

Q: [Question 6]
A: [Answer]

## Related Resources on BMV.parts
- [Link text 1]
- [Link text 2]
- [Link text 3]
- [Link text 4]

## Explore Parts on BMV.parts
[CTA — 2 sentences]
---

Write 1,200–2,500 words. Technical authority tone. Include real chassis codes and realistic pricing.`;

  const completion = await loggedChatCompletion(openai, "growth-engine", {
    model: "gpt-5",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 2500,
    temperature: 0.7,
  });

  const raw = completion.choices[0].message.content || "";
  const titleMatch = raw.match(/^TITLE:\s*(.+)$/m);
  const metaTitleMatch = raw.match(/^META_TITLE:\s*(.+)$/m);
  const metaDescMatch = raw.match(/^META_DESCRIPTION:\s*(.+)$/m);
  const contentMatch = raw.match(/CONTENT:\n([\s\S]+)/m);

  const title = titleMatch?.[1]?.trim() || subject;
  const metaTitle = metaTitleMatch?.[1]?.trim() || `${title} | BMV.parts`;
  const metaDescription = metaDescMatch?.[1]?.trim() || `${subject} — expert comparison of parts compatibility, costs, and differences on BMV.parts.`;
  const content = contentMatch?.[1]?.trim() || raw;

  return { title, content, metaTitle, metaDescription };
}

async function generateDataPageContent(topic: string, catalogData: any[]): Promise<{
  title: string; content: string; metaTitle: string; metaDescription: string;
}> {
  if (process.env.BMV_DISABLE_SEO_ENGINES === "1") {
    throw new Error("[seo-scheduler] BMV_DISABLE_SEO_ENGINES is active — data page generation suppressed");
  }
  const dataContext = catalogData.length > 0
    ? `Real catalog data to incorporate:\n${JSON.stringify(catalogData.slice(0, 20), null, 2)}`
    : "Use your knowledge of BMW parts pricing and market data for realistic figures.";

  const prompt = `You are an expert BMW data analyst and automotive writer for bmv.parts.

Write an authority statistics/data article about: "${topic}"

${dataContext}

STRUCTURE:
---
TITLE: [H1 — include year (2026) and "BMW" prominently]

META_TITLE: [Under 60 chars]

META_DESCRIPTION: [Under 155 chars]

CONTENT:
## Key Findings
[Summary box with 4–6 bullet points of the most important data points — AI Overview bait]

## Introduction
[150–200 words explaining methodology and why this data matters]

## Data Analysis
[400–600 words with specific numbers, trends, and insights]

## [Specific Topic Section]
[300–400 words drilling into a specific aspect]

## Frequently Asked Questions
Q: [Question 1]
A: [40–80 word direct answer with specific data]

Q: [Question 2]
A: [Answer]

Q: [Question 3]
A: [Answer]

Q: [Question 4]
A: [Answer]

Q: [Question 5]
A: [Answer]

## Methodology
[100–150 words — data source (BMV.parts catalog, OEM pricing databases), collection method, date]

## Related Data on BMV.parts
- [Link text 1]
- [Link text 2]
- [Link text 3]

## Explore Our Full BMW Parts Catalog
[CTA — 2 sentences]
---

Write 1,000–2,000 words. Cite specific chassis codes and part categories. Use realistic AUD/USD pricing.`;

  const completion = await loggedChatCompletion(openai, "growth-engine", {
    model: "gpt-5",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 2000,
    temperature: 0.6,
  });

  const raw = completion.choices[0].message.content || "";
  const titleMatch = raw.match(/^TITLE:\s*(.+)$/m);
  const metaTitleMatch = raw.match(/^META_TITLE:\s*(.+)$/m);
  const metaDescMatch = raw.match(/^META_DESCRIPTION:\s*(.+)$/m);
  const contentMatch = raw.match(/CONTENT:\n([\s\S]+)/m);

  const title = titleMatch?.[1]?.trim() || topic;
  const metaTitle = metaTitleMatch?.[1]?.trim() || `${title} | BMV.parts`;
  const metaDescription = metaDescMatch?.[1]?.trim() || `${topic} — original data and analysis from BMV.parts catalog.`;
  const content = contentMatch?.[1]?.trim() || raw;

  return { title, content, metaTitle, metaDescription };
}

// Fetch live catalog data for statistics pages
async function getCatalogDataForTopic(topic: string): Promise<any[]> {
  try {
    if (/expensive|price|cost/i.test(topic)) {
      const rows = await db.execute<any>(sql`
        SELECT pp.part_number_clean, pp.deal_price, pp.msrp, pp.aud_approx, p.description
        FROM part_pricing pp
        JOIN parts p ON pp.part_number_clean = p.part_number_clean
        WHERE pp.aud_approx IS NOT NULL AND pp.aud_approx > 500
        ORDER BY pp.aud_approx DESC
        LIMIT 20
      `);
      return rows.rows || [];
    }
    if (/common|popular|searched/i.test(topic)) {
      const rows = await db.execute<any>(sql`
        SELECT chassis, COUNT(*) as car_count, SUM(total_parts) as total_parts
        FROM cars
        WHERE chassis IS NOT NULL AND scrape_status = 'complete'
        GROUP BY chassis
        ORDER BY total_parts DESC
        LIMIT 20
      `);
      return rows.rows || [];
    }
    return [];
  } catch {
    return [];
  }
}

// Main content generation dispatcher
export async function generateContentPage(
  keyword: string,
  pageType: ContentPageType,
  keywordId?: number
): Promise<{ slug: string; pageId: number } | null> {
  try {
    const slug = slugify(keyword);

    // Check if slug already exists
    const existing = await db.execute(sql`
      SELECT id FROM seo_content_pages WHERE slug = ${slug}
    `);
    if ((existing.rows || []).length > 0) {
      return { slug, pageId: (existing.rows as any[])[0].id };
    }

    let result: { title: string; content: string; metaTitle: string; metaDescription: string };
    let catalogData: any[] = [];

    if (pageType === "guide") {
      result = await generateGuideContent(keyword);
    } else if (pageType === "compare") {
      result = await generateComparisonContent(keyword);
    } else if (pageType === "data") {
      catalogData = await getCatalogDataForTopic(keyword);
      result = await generateDataPageContent(keyword, catalogData);
    } else {
      result = await generateGuideContent(keyword);
    }

    const wc = wordCount(result.content);

    // Determine 90-day refresh date
    const refreshAt = new Date();
    refreshAt.setDate(refreshAt.getDate() + 90);

    const inserted = await db.execute(sql`
      INSERT INTO seo_content_pages (
        slug, page_type, primary_keyword, title, content,
        meta_title, meta_description, word_count, indexed
      ) VALUES (
        ${slug}, ${pageType}, ${keyword}, ${result.title}, ${result.content},
        ${result.metaTitle}, ${result.metaDescription}, ${wc}, false
      )
      RETURNING id
    `);

    const pageId = (inserted.rows as any[])[0]?.id;

    if (pageId) {
      // Queue for 90-day refresh
      await db.execute(sql`
        INSERT INTO seo_refresh_queue (page_id, due_at, status)
        VALUES (${pageId}, ${refreshAt.toISOString()}, 'pending')
        ON CONFLICT (page_id) DO NOTHING
      `);

      // Mark keyword as targeted
      if (keywordId) {
        await db.execute(sql`
          UPDATE seo_keywords SET page_targeting = ${slug} WHERE id = ${keywordId}
        `);
      }

      // Run internal linking pass (slug-based hub_url — not numeric ID)
      await injectInternalLinks(pageId, keyword, pageType, slug);
    }

    return pageId ? { slug, pageId } : null;
  } catch (err) {
    console.error("[seo/growth] generateContentPage error:", err);
    return null;
  }
}

// Batch: generate N content pages from the highest-priority untargeted keywords
export async function generateTopKeywordPages(limit = 5): Promise<{
  generated: number; errors: number;
}> {
  const rows = await db.execute<any>(sql`
    SELECT id, keyword, intent FROM seo_keywords
    WHERE page_targeting IS NULL
    ORDER BY priority DESC
    LIMIT ${limit}
  `);
  const keywords = rows.rows || [];

  let generated = 0;
  let errors = 0;

  for (const kw of keywords) {
    const pageType: ContentPageType =
      kw.intent === "comparison" ? "compare"
      : kw.intent === "informational" && /data|stat|price|cost|expensive/i.test(kw.keyword) ? "data"
      : "guide";

    const result = await generateContentPage(kw.keyword, pageType, kw.id);
    if (result) {
      generated++;
    } else {
      errors++;
    }
    // Rate-limit to avoid API hammering
    await new Promise(r => setTimeout(r, 1500));
  }

  return { generated, errors };
}

// ---------------------------------------------------------------------------
// 3. Internal Linking Engine
// ---------------------------------------------------------------------------
async function injectInternalLinks(
  pageId: number,
  keyword: string,
  pageType: ContentPageType,
  slug: string
): Promise<void> {
  try {
    // Find related chassis codes mentioned in the keyword
    const chassisMatches = keyword.match(/\b[EFG]\d{2,3}\b/gi) || [];

    const links: string[] = [];

    // Hub links for each chassis mentioned
    for (const code of chassisMatches.slice(0, 3)) {
      links.push(`/chassis/${code.toUpperCase()}`);
    }

    // Link to VIN decoder
    if (/vin|decoder|decode/i.test(keyword)) {
      links.push("/vin");
    }

    // Cross-cluster: link guides from comparison pages and vice versa
    if (pageType === "compare") {
      const guides = await db.execute<any>(sql`
        SELECT slug FROM seo_content_pages
        WHERE page_type = 'guide' AND indexed = false
        ORDER BY generated_at DESC LIMIT 3
      `);
      for (const g of (guides.rows || [])) {
        links.push(`/guides/${g.slug}`);
      }
    } else if (pageType === "guide") {
      const comparisons = await db.execute<any>(sql`
        SELECT slug FROM seo_content_pages
        WHERE page_type = 'compare'
        ORDER BY generated_at DESC LIMIT 2
      `);
      for (const c of (comparisons.rows || [])) {
        links.push(`/compare/${c.slug}`);
      }
    }

    if (links.length === 0) return;

    // Store internal links in the cluster table for this page
    const spokes = JSON.stringify(links);
    await db.execute(sql`
      INSERT INTO seo_content_clusters (cluster_name, hub_url, spoke_urls)
      VALUES (
        ${keyword},
        ${"/" + (pageType === "compare" ? "compare" : pageType === "data" ? "data" : "guides") + "/" + slug},
        ${spokes}::jsonb
      )
      ON CONFLICT (hub_url) DO UPDATE SET spoke_urls = EXCLUDED.spoke_urls
    `);
  } catch (err) {
    console.error("[seo/growth] injectInternalLinks error:", err);
  }
}

// ---------------------------------------------------------------------------
// 4. Refresh Engine
// ---------------------------------------------------------------------------
export async function processRefreshQueue(limit = 3): Promise<{
  refreshed: number; errors: number;
}> {
  const now = new Date().toISOString();
  const dueRows = await db.execute<any>(sql`
    SELECT rq.id AS queue_id, rq.page_id, cp.primary_keyword, cp.page_type
    FROM seo_refresh_queue rq
    JOIN seo_content_pages cp ON cp.id = rq.page_id
    WHERE rq.status = 'pending' AND rq.due_at <= ${now}
    ORDER BY rq.due_at ASC
    LIMIT ${limit}
  `);
  const due = dueRows.rows || [];

  let refreshed = 0;
  let errors = 0;

  for (const row of due) {
    try {
      // Mark processing
      await db.execute(sql`
        UPDATE seo_refresh_queue SET status = 'processing' WHERE id = ${row.queue_id}
      `);

      // Regenerate content
      let result: { title: string; content: string; metaTitle: string; metaDescription: string } | null = null;
      const pt: ContentPageType = row.page_type;

      if (pt === "guide") {
        result = await generateGuideContent(row.primary_keyword);
      } else if (pt === "compare") {
        result = await generateComparisonContent(row.primary_keyword);
      } else if (pt === "data") {
        const catalogData = await getCatalogDataForTopic(row.primary_keyword);
        result = await generateDataPageContent(row.primary_keyword, catalogData);
      }

      if (result) {
        const wc = wordCount(result.content);
        await db.execute(sql`
          UPDATE seo_content_pages
          SET title = ${result.title}, content = ${result.content},
              meta_title = ${result.metaTitle}, meta_description = ${result.metaDescription},
              word_count = ${wc}, last_refreshed_at = NOW()
          WHERE id = ${row.page_id}
        `);
      }

      // Re-schedule next refresh (+90 days)
      const nextRefresh = new Date();
      nextRefresh.setDate(nextRefresh.getDate() + 90);
      await db.execute(sql`
        UPDATE seo_refresh_queue SET status = 'pending', due_at = ${nextRefresh.toISOString()}
        WHERE id = ${row.queue_id}
      `);

      refreshed++;
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`[seo/growth] refresh error for page ${row.page_id}:`, err);
      await db.execute(sql`
        UPDATE seo_refresh_queue SET status = 'pending' WHERE id = ${row.queue_id}
      `);
      errors++;
    }
  }

  return { refreshed, errors };
}

// ---------------------------------------------------------------------------
// 5. Stats
// ---------------------------------------------------------------------------
export async function getGrowthStats(): Promise<{
  totalKeywords: number;
  targetedKeywords: number;
  totalContentPages: number;
  guidesCount: number;
  compareCount: number;
  dataCount: number;
  pendingRefresh: number;
  generatedToday: number;
  generatedThisWeek: number;
  highPriorityKeywords: any[];
  recentPages: any[];
  refreshQueue: any[];
}> {
  const [kw, cp, rq, today, week, hpKw, recentPg, rfQueue] = await Promise.all([
    db.execute<any>(sql`SELECT COUNT(*) AS total, COUNT(page_targeting) AS targeted FROM seo_keywords`),
    db.execute<any>(sql`
      SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE page_type = 'guide') AS guides,
        COUNT(*) FILTER (WHERE page_type = 'compare') AS compare_count,
        COUNT(*) FILTER (WHERE page_type = 'data') AS data_count
      FROM seo_content_pages
    `),
    db.execute<any>(sql`SELECT COUNT(*) AS pending FROM seo_refresh_queue WHERE status = 'pending' AND due_at <= NOW()`),
    db.execute<any>(sql`SELECT COUNT(*) AS cnt FROM seo_content_pages WHERE generated_at >= NOW() - INTERVAL '1 day'`),
    db.execute<any>(sql`SELECT COUNT(*) AS cnt FROM seo_content_pages WHERE generated_at >= NOW() - INTERVAL '7 days'`),
    db.execute<any>(sql`SELECT id, keyword, intent, priority, volume_est, difficulty FROM seo_keywords WHERE page_targeting IS NULL ORDER BY priority DESC LIMIT 10`),
    db.execute<any>(sql`SELECT id, slug, page_type, primary_keyword, word_count, generated_at, last_refreshed_at FROM seo_content_pages ORDER BY generated_at DESC LIMIT 10`),
    db.execute<any>(sql`
      SELECT rq.id, rq.due_at, rq.status, cp.slug, cp.primary_keyword, cp.page_type
      FROM seo_refresh_queue rq
      JOIN seo_content_pages cp ON cp.id = rq.page_id
      WHERE rq.status = 'pending'
      ORDER BY rq.due_at ASC
      LIMIT 10
    `),
  ]);

  const kwRow = (kw.rows as any[])[0] || {};
  const cpRow = (cp.rows as any[])[0] || {};

  return {
    totalKeywords: Number(kwRow.total || 0),
    targetedKeywords: Number(kwRow.targeted || 0),
    totalContentPages: Number(cpRow.total || 0),
    guidesCount: Number(cpRow.guides || 0),
    compareCount: Number(cpRow.compare_count || 0),
    dataCount: Number(cpRow.data_count || 0),
    pendingRefresh: Number((rq.rows as any[])[0]?.pending || 0),
    generatedToday: Number((today.rows as any[])[0]?.cnt || 0),
    generatedThisWeek: Number((week.rows as any[])[0]?.cnt || 0),
    highPriorityKeywords: (hpKw.rows as any[]) || [],
    recentPages: (recentPg.rows as any[]) || [],
    refreshQueue: (rfQueue.rows as any[]) || [],
  };
}
