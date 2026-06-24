import type { PhotoQuote, QuoteRow } from "@shared/schema";

function escCsv(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsv(quote: PhotoQuote): string {
  const rows = (quote.quoteRows ?? []) as QuoteRow[];
  const date = new Date(quote.createdAt).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const chassis = (() => {
    const v = quote.vehicle ?? "";
    const m = v.match(/\b(G\d{2}|F\d{2}|E\d{2}|U\d{2})\b/);
    return m ? m[1] : "";
  })();

  const lines: string[] = [];

  const BOM = "\uFEFF";

  lines.push(`BMW ${quote.vehicle} Parts Pricing Comparison`);
  lines.push(`Vehicle,${escCsv(quote.vehicle)}`);
  lines.push(`VIN,${escCsv(quote.vin ?? "")}`);
  lines.push(`Date prepared,${escCsv(date)}`);
  lines.push(`M PERFORMANCE PARTS`);
  lines.push("");

  lines.push(
    [
      "Estimate Item",
      "OEM Description",
      "BMW New (AUD)",
      "Our Price (AUD)",
      "Saving",
      "Category",
      "BMW OEM #",
    ]
      .map(escCsv)
      .join(",")
  );

  for (const row of rows) {
    lines.push(
      [
        row.estimateItem,
        row.oemDescription,
        row.bmwNew.toFixed(2),
        row.ourPrice.toFixed(2),
        row.saving.toFixed(2),
        row.category,
        row.oemNumber ?? "",
      ]
        .map(escCsv)
        .join(",")
    );
  }

  lines.push(
    [
      "GRAND TOTAL",
      "",
      quote.totalBmwNew.toFixed(2),
      quote.totalOurPrice.toFixed(2),
      quote.totalSaving.toFixed(2),
      "",
      "",
    ]
      .map(escCsv)
      .join(",")
  );

  return BOM + lines.join("\r\n");
}
