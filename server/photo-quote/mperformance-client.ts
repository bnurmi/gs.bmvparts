import type { PhotoQuote, QuoteRow } from "@shared/schema";

const MPERF_API_URL = "https://mperformance.parts/api/partner/leads";

function detectCategory(rows: QuoteRow[]): string {
  const frontDamage = rows.some(r =>
    r.category?.toLowerCase().includes("front") ||
    r.oemDescription?.toLowerCase().includes("front") ||
    r.oemDescription?.toLowerCase().includes("bonnet") ||
    r.oemDescription?.toLowerCase().includes("hood") ||
    r.oemDescription?.toLowerCase().includes("bumper") ||
    r.oemDescription?.toLowerCase().includes("radiator") ||
    r.oemDescription?.toLowerCase().includes("headlamp") ||
    r.oemDescription?.toLowerCase().includes("headlight")
  );
  return frontDamage ? "complete-front-clip" : "exterior-body-panels";
}

function buildPartsSummary(rows: QuoteRow[]): string {
  return rows
    .map(r => `${r.estimateItem}: ${r.oemDescription}${r.oemNumber ? ` (${r.oemNumber})` : ""}`)
    .join("; ")
    .slice(0, 2000);
}

export async function submitToMPerformance(quote: PhotoQuote): Promise<string | null> {
  const apiKey = process.env.QUOTE_PARTS_API_KEY;
  if (!apiKey) {
    console.log("[mperf] QUOTE_PARTS_API_KEY not set — skipping MPerformance submission");
    return null;
  }

  if (quote.mperformanceRef) {
    console.log(`[mperf] Quote ${quote.quoteRef} already submitted (ref: ${quote.mperformanceRef}), skipping`);
    return quote.mperformanceRef;
  }

  const rows = (quote.quoteRows ?? []) as QuoteRow[];

  const payload = {
    category: detectCategory(rows),
    fullName: quote.customerName ?? null,
    email: quote.customerEmail ?? null,
    phone: quote.customerPhone ?? null,
    vin: quote.vin ?? null,
    make: "BMW",
    model: quote.vehicle,
    year: quote.vehicleYear ?? null,
    colour: quote.vehicleColour ?? null,
    shippingPostcode: quote.customerPostcode ?? null,
    notes: `AI damage quote generated via bmv.parts. Total Our Price AUD: $${quote.totalOurPrice.toFixed(2)}. Quote ref: ${quote.quoteRef}.`,
    answers: {
      partDescription: buildPartsSummary(rows),
      quoteRef: quote.quoteRef,
      totalBmwNew: quote.totalBmwNew.toFixed(2),
      totalOurPrice: quote.totalOurPrice.toFixed(2),
      lineItemCount: String(rows.length),
    },
  };

  try {
    const res = await fetch(MPERF_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 201) {
      const data = await res.json();
      const ref: string = data.referenceNumber ?? data.reference ?? data.ref ?? null;
      console.log(`[mperf] Submitted quote ${quote.quoteRef}, got ref: ${ref}`);
      return ref;
    }

    const body = await res.text();
    console.error(`[mperf] Non-201 response (${res.status}): ${body}`);
    return null;
  } catch (err: any) {
    console.error(`[mperf] Submission error for ${quote.quoteRef}:`, err.message);
    return null;
  }
}
