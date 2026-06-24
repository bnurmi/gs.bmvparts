// AI-generated FAQ service (Task #228).
// Calls GPT-5 to produce 3-5 Q&A pairs per (pageType, pageKey, locale),
// then caches permanently in `ai_faq_cache`. On subsequent SSR requests for
// the same key the DB row is returned immediately — OpenAI is only called once.

import OpenAI from "openai";
import { storage } from "../storage";
import { loggedChatCompletion } from "../openai-logger";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export type AiFaqPageType = "part" | "chassis" | "series" | "vin" | "facet";

export interface AiFaqItem {
  q: string;
  a: string;
}

export interface AiFaqContext {
  // part
  partNumber?: string;
  partDescription?: string;
  chassisCodes?: string[];
  categoryName?: string;
  subcategoryName?: string;
  hierarchyPath?: string;
  supersededBy?: string | null;
  weight?: number | null;
  vehicleCount?: number;
  // chassis
  chassisCode?: string;
  series?: string | null;
  yearRange?: string;
  carCount?: number;
  totalParts?: number;
  // series
  seriesName?: string;
  seriesChassisCount?: number;
  // vin
  vin?: string;
  vinChassis?: string | null;
  vinModelYear?: number | null;
  vinSeries?: string | null;
  vinModelName?: string | null;
  vinPlantCity?: string | null;
  vinPlantCountry?: string | null;
  // facet
  facetKind?: string;
  facetValue?: string;
}

// Map BCP-47 locale code → human-readable language name for the system prompt.
const LOCALE_LANGUAGE: Record<string, string> = {
  "en":    "English",
  "de-DE": "German",
  "fr-FR": "French",
  "es-ES": "Spanish (Spain)",
  "it-IT": "Italian",
  "zh-CN": "Simplified Chinese",
  "ko-KR": "Korean",
  "es-MX": "Spanish (Mexico)",
  "en-ZA": "English (South Africa)",
  "pt-BR": "Portuguese (Brazil)",
  "ru-RU": "Russian",
};

function buildSystemPrompt(locale: string): string {
  const lang = LOCALE_LANGUAGE[locale] || "English";
  return `You are an expert BMW parts catalog assistant for BMV.parts. Your task is to generate 3-5 natural, helpful FAQ Q&A pairs for a given page in the BMW parts catalog. Write entirely in ${lang}. Return ONLY a valid JSON array of objects with keys "q" (question) and "a" (answer). No markdown, no wrapping text — just the raw JSON array. Each answer should be 1-3 sentences, factual, and useful to BMW owners, mechanics, and enthusiasts. Avoid generic filler.`;
}

function buildUserPrompt(pageType: AiFaqPageType, pageKey: string, ctx: AiFaqContext): string {
  switch (pageType) {
    case "part": {
      const chassis = (ctx.chassisCodes || []).slice(0, 6).join(", ");
      const cat = [ctx.categoryName, ctx.subcategoryName].filter(Boolean).join(" › ");
      return `Generate 3-5 FAQ pairs for the BMW OEM part page:
- Part number: ${pageKey}
- Description: ${ctx.partDescription || "BMW Part"}
- Fits chassis: ${chassis || "various"}
- Catalog location: ${cat || "unknown"}
- Vehicle count: ${ctx.vehicleCount || 0}
${ctx.supersededBy ? `- Superseded by: ${ctx.supersededBy}` : ""}
${ctx.weight != null ? `- Weight: ${ctx.weight.toFixed(3)} kg` : ""}

Cover topics such as: which BMW models this part fits, catalog location / how to find it in diagrams, fitment verification by VIN, supersession history, and quantity-per-vehicle. Be specific to the actual part.`;
    }
    case "chassis": {
      return `Generate 3-5 FAQ pairs for the BMW ${pageKey} chassis hub page on BMV.parts:
- Chassis: ${pageKey}
${ctx.series ? `- Series: ${ctx.series}` : ""}
${ctx.yearRange ? `- Production years: ${ctx.yearRange}` : ""}
- Model variants catalogued: ${ctx.carCount || 0}
- Total OEM parts indexed: ${(ctx.totalParts || 0).toLocaleString()}

Cover topics such as: key production years and variants, most common maintenance parts for this chassis, OBD/diagnostic notes, how to find the right part for a specific build, and notable engineering differences between variants. Be specific to the ${pageKey} chassis — avoid generic BMW advice.`;
    }
    case "series": {
      return `Generate 3-5 FAQ pairs for the BMW ${ctx.seriesName || pageKey} series hub page on BMV.parts:
- Series: ${ctx.seriesName || pageKey}
- Chassis generations covered: ${(ctx.chassisCodes || []).join(", ")}
- Total chassis generations: ${ctx.seriesChassisCount || (ctx.chassisCodes || []).length}

Cover topics such as: which chassis codes belong to this series and when they were produced, generational differences between chassis codes, key trim levels / special variants, and how to navigate the BMV.parts catalog to find the right generation. Be specific to this series.`;
    }
    case "vin": {
      return `Generate 3-5 FAQ pairs for a BMW VIN result page. The decoded VIN reveals:
- VIN: ${ctx.vin || pageKey}
${ctx.vinChassis ? `- Chassis: ${ctx.vinChassis}` : ""}
${ctx.vinModelYear ? `- Model year: ${ctx.vinModelYear}` : ""}
${ctx.vinSeries ? `- Series: ${ctx.vinSeries}` : ""}
${ctx.vinModelName ? `- Model: ${ctx.vinModelName}` : ""}
${ctx.vinPlantCity ? `- Production plant: ${ctx.vinPlantCity}${ctx.vinPlantCountry ? `, ${ctx.vinPlantCountry}` : ""}` : ""}

Cover topics such as: what each section of a BMW VIN reveals, what the production plant code means for this car, how the model year is encoded, how to use the VIN to find the exact right OEM parts, and what production sequence numbers indicate. Be specific to this VIN's decoded data.`;
    }
    case "facet": {
      const [kind, value] = pageKey.split(":");
      return `Generate 3-5 FAQ pairs for a BMW VIN facet hub page on bmv.vin:
- Facet type: ${kind || ctx.facetKind || "unknown"}
- Facet value: ${value || ctx.facetValue || "unknown"}

Cover topics such as: what this ${kind || "attribute"} value means in a BMW VIN, which BMW models or chassis codes share this attribute, what practical significance this has for owners (e.g., production plant quality control, regional specifications, model year dating), and how it affects part compatibility. Be specific and factual.`;
    }
  }
}

/**
 * Fetch cached AI FAQ or generate it via GPT-5.
 * Returns null if generation fails (caller should fall back to deterministic FAQ).
 */
export async function generateAiFaq(
  pageType: AiFaqPageType,
  pageKey: string,
  locale: string,
  context: AiFaqContext,
  forceRegenerate = false,
): Promise<AiFaqItem[] | null> {
  // Kill switch — set BMV_DISABLE_AI_FAQ=1 to stop all new OpenAI generation.
  // Cached results are still served; only new generation is blocked.
  if (process.env.BMV_DISABLE_AI_FAQ === "1") return null;

  // Check cache first (unless force-regenerate).
  if (!forceRegenerate) {
    try {
      const cached = await storage.getAiFaq(pageType, pageKey, locale);
      if (cached) return cached.faqItems as AiFaqItem[];
    } catch (err) {
      console.warn("[ai-faq] cache read failed", err);
    }
  }

  // Generate via GPT-5.
  try {
    const systemPrompt = buildSystemPrompt(locale);
    const userPrompt = buildUserPrompt(pageType, pageKey, context);

    const response = await loggedChatCompletion(openai, "ai-faq", {
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: 1024,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "";
    let items: AiFaqItem[] = [];

    // GPT returns a JSON object, but we asked for an array — handle both shapes.
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        items = parsed;
      } else if (Array.isArray(parsed.faqs)) {
        items = parsed.faqs;
      } else if (Array.isArray(parsed.faq)) {
        items = parsed.faq;
      } else {
        // Try to find any array value in the object.
        const arrayVal = Object.values(parsed).find(v => Array.isArray(v));
        if (Array.isArray(arrayVal)) items = arrayVal as AiFaqItem[];
      }
    } catch {
      console.warn("[ai-faq] JSON parse failed for", pageType, pageKey, locale);
      return null;
    }

    // Normalize and validate items.
    items = items
      .filter(it => it && typeof it.q === "string" && typeof it.a === "string")
      .map(it => ({ q: it.q.trim(), a: it.a.trim() }))
      .filter(it => it.q.length > 0 && it.a.length > 0)
      .slice(0, 5);

    if (items.length === 0) return null;

    // Persist to cache.
    await storage.upsertAiFaq({ pageType, pageKey, locale, faqItems: items as any });
    return items;
  } catch (err) {
    console.error("[ai-faq] generation failed", { pageType, pageKey, locale }, err);
    return null;
  }
}

/**
 * Build a FAQPage JSON-LD node from AI FAQ items.
 */
export function buildFaqPageJsonLd(items: AiFaqItem[], locale: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: locale,
    mainEntity: items.map(f => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
