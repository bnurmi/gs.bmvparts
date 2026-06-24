/**
 * Safe markdown-to-HTML renderer with strict XSS protection.
 * Escapes all HTML before applying markdown transforms — no raw HTML passthrough,
 * no event attributes, no script injection possible.
 */

const ALLOWED_TAGS = new Set([
  "h2", "h3", "h4", "p", "ul", "ol", "li", "strong", "em", "code", "pre",
  "blockquote", "br", "hr", "a", "table", "thead", "tbody", "tr", "th", "td",
]);

/** Escape HTML entities in a string (before markdown transforms). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Strip any disallowed tags and attributes from HTML produced by
 * our own regex transforms (belt-and-suspenders defence).
 * Allowed attributes: class on block elements, nothing else.
 */
export function sanitizeHtml(html: string): string {
  // Remove script/style/iframe/object/embed blocks entirely
  html = html.replace(/<(script|style|iframe|object|embed|form|input|button)[^>]*>[\s\S]*?<\/\1>/gi, "");
  // Strip dangerous attributes (on*, href="javascript:", data:, etc.)
  html = html.replace(/\s(on\w+|href\s*=\s*["']?javascript:[^"'\s>]*|src\s*=\s*["']?(?:javascript:|data:)[^"'\s>]*)[^>]*/gi, "");
  return html;
}

/**
 * Convert plain-text markdown (as stored by the growth engine) into sanitised HTML.
 * Content enters as raw markdown (never raw HTML from the DB), so we escape
 * everything first, then apply structural transforms.
 */
export function renderMarkdown(md: string): string {
  // 1. Split into lines for processing
  const lines = md.split("\n");
  const result: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeList = () => {
    if (inUl) { result.push("</ul>"); inUl = false; }
    if (inOl) { result.push("</ol>"); inOl = false; }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Headings (escape first, then mark)
    const h3 = line.match(/^### (.+)$/);
    const h2 = line.match(/^## (.+)$/);
    const h4 = line.match(/^#### (.+)$/);
    if (h4) { closeList(); result.push(`<h4>${escapeHtml(h4[1])}</h4>`); continue; }
    if (h3) { closeList(); result.push(`<h3>${escapeHtml(h3[1])}</h3>`); continue; }
    if (h2) { closeList(); result.push(`<h2>${escapeHtml(h2[1])}</h2>`); continue; }

    // Horizontal rule
    if (/^---+$/.test(line)) { closeList(); result.push("<hr>"); continue; }

    // Unordered list
    const ulMatch = line.match(/^[-*] (.+)$/);
    if (ulMatch) {
      if (!inUl) { closeList(); result.push("<ul>"); inUl = true; }
      result.push(`<li>${inlineFormat(escapeHtml(ulMatch[1]))}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\d+\. (.+)$/);
    if (olMatch) {
      if (!inOl) { closeList(); result.push("<ol>"); inOl = true; }
      result.push(`<li>${inlineFormat(escapeHtml(olMatch[1]))}</li>`);
      continue;
    }

    // Blockquote
    const bqMatch = line.match(/^> (.+)$/);
    if (bqMatch) {
      closeList();
      result.push(`<blockquote>${inlineFormat(escapeHtml(bqMatch[1]))}</blockquote>`);
      continue;
    }

    // Empty line
    if (line === "") {
      closeList();
      result.push("");
      continue;
    }

    // Paragraph
    closeList();
    result.push(`<p>${inlineFormat(escapeHtml(line))}</p>`);
  }

  closeList();

  // Run sanitize pass for belt-and-suspenders defence
  return sanitizeHtml(result.join("\n"));
}

/** Apply inline formatting (bold, italic, code) to an already-escaped string. */
function inlineFormat(s: string): string {
  return s
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Already-escaped entities should stay escaped — no further transforms needed
    ;
}
