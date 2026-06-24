/**
 * Validation logic for SEO Publisher API content submissions.
 *
 * Returns a structured { passed, errors[], warnings[] } object.
 * No DB writes happen inside this module; it is side-effect free so it
 * can be called by both the standalone /validate endpoint and the
 * create/update endpoints before they touch the DB.
 */

import { db } from "../storage";
import { sql } from "drizzle-orm";
import sanitizeHtmlLib from "sanitize-html";

// ---------------------------------------------------------------------------
// Internal terms that must never appear in a slug
// ---------------------------------------------------------------------------
const BLOCKED_SLUG_TERMS = [
  "seo-hub", "seohub", "admin", "internal", "draft-preview", "staging",
  "test-page", "__test__",
];

// ---------------------------------------------------------------------------
// Simple HTML tag stripper (no external deps)
// ---------------------------------------------------------------------------
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// HTML sanitizer — strict allowlist via sanitize-html (not regex-based).
// Only explicitly allowed tags, attributes, and protocols pass through.
// body_html is stored pre-sanitized and server-rendered verbatim in SSR.
// ---------------------------------------------------------------------------
export function sanitizeHtml(html: string): string {
  return sanitizeHtmlLib(html, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "br", "hr",
      "ul", "ol", "li",
      "strong", "em", "b", "i", "u", "s", "code", "pre", "blockquote",
      "a", "img",
      "table", "thead", "tbody", "tr", "th", "td",
      "div", "span", "section", "article", "aside", "header", "footer", "main",
      "figure", "figcaption",
    ],
    allowedAttributes: {
      "a": ["href", "title", "rel", "target"],
      "img": ["src", "alt", "title", "width", "height", "loading"],
      "td": ["colspan", "rowspan"],
      "th": ["colspan", "rowspan", "scope"],
      "*": ["id", "class"],
    },
    allowedSchemes: ["https", "http", "mailto"],
    allowedSchemesByTag: { "img": ["https", "http"] },
    disallowedTagsMode: "discard",
  });
}

// ---------------------------------------------------------------------------
// H1 count — count h1 opening tags in HTML
// ---------------------------------------------------------------------------
function countH1Tags(html: string): number {
  const matches = html.match(/<h1[\s>]/gi);
  return matches ? matches.length : 0;
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------
export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Main validator
// ---------------------------------------------------------------------------
export interface PublisherPageInput {
  slug?: string;
  title?: string;
  metaDescription?: string;
  h1?: string;
  bodyHtml?: string;
  schemaJson?: unknown;
  canonicalUrl?: string;
  internalLinks?: Array<{ text: string; href: string }>;
  contentType?: string;
  domain?: string;
}

export interface ValidateOptions {
  /**
   * When true (partial update), slug/title/bodyHtml are only validated if
   * they are present in the input — they are not required to be provided.
   */
  isUpdate?: boolean;
  /**
   * ID of the existing page being updated, used to skip duplicate-slug errors
   * for the page's own current slug.
   */
  existingId?: number;
}

export async function validatePublisherPage(
  input: PublisherPageInput,
  existingIdOrOptions?: number | ValidateOptions,
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Resolve options for backward compatibility (was previously just existingId: number)
  let existingId: number | undefined;
  let isUpdate = false;
  if (typeof existingIdOrOptions === "number") {
    existingId = existingIdOrOptions;
  } else if (existingIdOrOptions) {
    existingId = existingIdOrOptions.existingId;
    isUpdate = existingIdOrOptions.isUpdate ?? false;
  }

  // 1. Slug validation
  const slugProvided = input.slug !== undefined && input.slug !== null && input.slug !== "";
  if (!slugProvided) {
    if (!isUpdate) {
      errors.push("slug is required");
    }
  } else {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug!)) {
      errors.push("slug must be URL-safe lowercase alphanumeric with hyphens only (e.g. bmw-m3-parts-guide)");
    }
    if (input.slug!.length > 200) {
      errors.push("slug must not exceed 200 characters");
    }
    const blocked = BLOCKED_SLUG_TERMS.find((term) => input.slug!.includes(term));
    if (blocked) {
      errors.push(`slug contains blocked internal term: '${blocked}'`);
    }

    // Duplicate slug check — scoped by domain when available (slug is unique per domain)
    const dupResult = await db.execute(sql`
      SELECT id, domain FROM seo_publisher_pages WHERE slug = ${input.slug}
    `);
    const dupRows = (dupResult as any).rows ?? dupResult;
    for (const row of dupRows) {
      const foundId = row.id as number;
      const foundDomain = row.domain as string;
      // Only flag duplicate if same domain and different page
      const sameDomain = !input.domain || foundDomain === input.domain;
      if (sameDomain && (existingId === undefined || foundId !== existingId)) {
        errors.push(`slug '${input.slug}' is already in use by page id=${foundId} on domain '${foundDomain}'`);
      }
    }
  }

  // 2. Title length (10–70 chars)
  const titleProvided = input.title !== undefined && input.title !== null;
  if (!titleProvided) {
    if (!isUpdate) {
      errors.push("title is required");
    }
  } else {
    if (input.title!.length < 10) {
      errors.push("title must be at least 10 characters");
    }
    if (input.title!.length > 70) {
      warnings.push(`title is ${input.title!.length} characters; recommended max is 70 for search snippets`);
    }
  }

  // 3. Meta description (50–160 chars)
  if (input.metaDescription !== undefined && input.metaDescription !== null) {
    if (input.metaDescription.length < 50) {
      warnings.push("metaDescription is shorter than 50 characters; search snippets may be auto-generated");
    }
    if (input.metaDescription.length > 160) {
      warnings.push(`metaDescription is ${input.metaDescription.length} characters; recommended max is 160`);
    }
  } else if (!isUpdate) {
    warnings.push("metaDescription is missing; search snippets may be auto-generated");
  }

  // 4. Body HTML checks (only required on create; updates may omit to keep existing body)
  const bodyProvided = input.bodyHtml !== undefined && input.bodyHtml !== null;
  if (!bodyProvided) {
    if (!isUpdate) {
      errors.push("bodyHtml must not be empty");
    }
  } else if (input.bodyHtml!.trim().length === 0) {
    errors.push("bodyHtml must not be empty");
  } else {
    const plainText = stripHtml(input.bodyHtml!);
    if (plainText.length < 200) {
      errors.push(`bodyHtml content is too short (${plainText.length} chars plain-text); minimum is 200 characters`);
    }

    const h1Count = countH1Tags(input.bodyHtml!);
    if (h1Count > 1) {
      errors.push(`bodyHtml contains ${h1Count} <h1> tags; only one H1 is allowed per page`);
    }
    if (h1Count === 0 && !input.h1) {
      warnings.push("no H1 found in bodyHtml and h1 field is not set; consider adding an H1");
    }
  }

  // 5. Schema JSON validity
  if (input.schemaJson !== undefined && input.schemaJson !== null) {
    try {
      if (typeof input.schemaJson === "string") {
        JSON.parse(input.schemaJson);
      }
    } catch {
      errors.push("schemaJson is not valid JSON");
    }
  }

  // 6. Canonical URL host match
  if (input.canonicalUrl) {
    try {
      const parsed = new URL(input.canonicalUrl);
      const allowedHosts = ["bmv.parts", "www.bmv.parts", "bmw.parts", "www.bmw.parts", "bmw.vin", "www.bmw.vin"];
      if (!allowedHosts.includes(parsed.hostname)) {
        warnings.push(`canonicalUrl hostname '${parsed.hostname}' is not a known bmv property`);
      }
    } catch {
      errors.push("canonicalUrl is not a valid URL");
    }
  }

  // 7. Internal link format
  if (Array.isArray(input.internalLinks)) {
    input.internalLinks.forEach((link, i) => {
      if (!link.text || typeof link.text !== "string") {
        errors.push(`internalLinks[${i}] is missing 'text' field`);
      }
      if (!link.href || typeof link.href !== "string") {
        errors.push(`internalLinks[${i}] is missing 'href' field`);
      } else if (!link.href.startsWith("/") && !link.href.startsWith("https://")) {
        errors.push(`internalLinks[${i}].href must be an absolute path starting with / or https://`);
      }
    });
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}
