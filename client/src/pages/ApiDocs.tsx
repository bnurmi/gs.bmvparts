import { useState } from "react";
import { SEO } from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Code2, Key, Terminal } from "lucide-react";

interface Endpoint {
  method: "GET" | "POST";
  path: string;
  description: string;
  exampleUrl: string;
  exampleResponse: string;
  exampleRequestBody?: string;
  params?: { name: string; description: string }[];
  queryParams?: { name: string; description: string; example?: string }[];
}

interface EndpointSection {
  title: string;
  description: string;
  endpoints: Endpoint[];
}

const SECTIONS: EndpointSection[] = [
  {
    title: "Catalog — Vehicles",
    description: "Browse the BMW catalog. All vehicle data is from the offline snapshot.",
    endpoints: [
      {
        method: "GET",
        path: "/api/cars",
        description: "List all catalog vehicles with part counts and scrape status.",
        exampleUrl: "https://bmv.parts/api/cars",
        exampleResponse: JSON.stringify([
          {
            id: 42,
            slug: "e46-320i-sedan",
            displayName: "E46 320i Sedan",
            chassis: "E46",
            generation: "3 Series (1997–2006)",
            engine: "M54B22",
            bodyType: "Sedan",
            totalParts: 18432,
            scrapeStatus: "complete",
          },
        ], null, 2),
      },
      {
        method: "GET",
        path: "/api/cars/:idOrSlug",
        description: "Get a single vehicle by numeric ID or slug.",
        params: [{ name: "idOrSlug", description: "Numeric car ID or slug string (e.g. e46-320i-sedan)" }],
        exampleUrl: "https://bmv.parts/api/cars/e46-320i-sedan",
        exampleResponse: JSON.stringify({
          id: 42,
          slug: "e46-320i-sedan",
          displayName: "E46 320i Sedan",
          chassis: "E46",
          generation: "3 Series (1997–2006)",
          engine: "M54B22",
          bodyType: "Sedan",
          totalParts: 18432,
          scrapeStatus: "complete",
        }, null, 2),
      },
    ],
  },
  {
    title: "Catalog — Categories & Parts",
    description: "Traverse the three-level hierarchy: car → category → subcategory → parts.",
    endpoints: [
      {
        method: "GET",
        path: "/api/cars/:id/categories",
        description: "List top-level part categories for a vehicle.",
        params: [{ name: "id", description: "Numeric car ID" }],
        exampleUrl: "https://bmv.parts/api/cars/42/categories",
        exampleResponse: JSON.stringify([
          { id: 101, name: "Engine", subcategoryCount: 14 },
          { id: 102, name: "Fuel Preparation", subcategoryCount: 8 },
        ], null, 2),
      },
      {
        method: "GET",
        path: "/api/categories/:id/subcategories",
        description: "List subcategories within a category.",
        params: [{ name: "id", description: "Numeric category ID" }],
        exampleUrl: "https://bmv.parts/api/categories/101/subcategories",
        exampleResponse: JSON.stringify([
          { id: 2001, name: "Engine Block", partCount: 92 },
          { id: 2002, name: "Cylinder Head", partCount: 47 },
        ], null, 2),
      },
      {
        method: "GET",
        path: "/api/subcategories/:id/parts",
        description: "List parts within a subcategory, including part numbers and diagram references.",
        params: [{ name: "id", description: "Numeric subcategory ID" }],
        exampleUrl: "https://bmv.parts/api/subcategories/2001/parts",
        exampleResponse: JSON.stringify([
          {
            id: 990123,
            partNumber: "11111704220",
            partNumberClean: "11111704220",
            description: "Gasket, cylinder head",
            quantity: 1,
            note: null,
            diagramPosition: "3",
          },
        ], null, 2),
      },
      {
        method: "GET",
        path: "/api/cars/:id/parts",
        description: "Flat list of all parts for a vehicle. Large responses — use subcategory endpoint for targeted queries.",
        params: [{ name: "id", description: "Numeric car ID" }],
        queryParams: [
          { name: "q", description: "Optional text filter applied server-side", example: "gasket" },
        ],
        exampleUrl: "https://bmv.parts/api/cars/42/parts?q=gasket",
        exampleResponse: JSON.stringify([
          {
            id: 990123,
            partNumber: "11111704220",
            partNumberClean: "11111704220",
            description: "Gasket, cylinder head",
            categoryId: 101,
            subcategoryId: 2001,
          },
        ], null, 2),
      },
      {
        method: "GET",
        path: "/api/parts/cross-reference/:partNumberClean",
        description: "Cross-reference a part number to find which BMW models use it.",
        params: [{ name: "partNumberClean", description: "OEM part number with no spaces or dashes (e.g. 11111704220)" }],
        exampleUrl: "https://bmv.parts/api/parts/cross-reference/11111704220",
        exampleResponse: JSON.stringify({
          partNumber: "11111704220",
          description: "Gasket, cylinder head",
          usedIn: [
            { carId: 42, slug: "e46-320i-sedan", displayName: "E46 320i Sedan" },
            { carId: 78, slug: "e39-520i-sedan", displayName: "E39 520i Sedan" },
          ],
        }, null, 2),
      },
    ],
  },
  {
    title: "Search",
    description: "Full-text search across all part descriptions and numbers in the catalog.",
    endpoints: [
      {
        method: "GET",
        path: "/api/search",
        description: "Search parts by description or part number. Returns paginated results.",
        queryParams: [
          { name: "q", description: "Search query (required)", example: "water pump" },
          { name: "limit", description: "Max results to return (default 20, max 100)", example: "20" },
          { name: "offset", description: "Pagination offset", example: "0" },
        ],
        exampleUrl: "https://bmv.parts/api/search?q=water+pump&limit=5",
        exampleResponse: JSON.stringify({
          results: [
            {
              id: 445001,
              partNumber: "11517527799",
              partNumberClean: "11517527799",
              description: "Water Pump",
              carId: 42,
              carDisplayName: "E46 320i Sedan",
              categoryName: "Engine Cooling",
            },
          ],
          total: 142,
          limit: 5,
          offset: 0,
        }, null, 2),
      },
    ],
  },
  {
    title: "Catalog — Statistics & Series",
    description: "Aggregate catalog metadata and series groupings.",
    endpoints: [
      {
        method: "GET",
        path: "/api/stats",
        description: "Overall catalog statistics: total vehicles, scraped count, and total parts.",
        exampleUrl: "https://bmv.parts/api/stats",
        exampleResponse: JSON.stringify({
          totalCars: 1312,
          scrapedCars: 1187,
          totalParts: 5970241,
        }, null, 2),
      },
      {
        method: "GET",
        path: "/api/series",
        description: "List BMW series groups with chassis codes and vehicle counts.",
        exampleUrl: "https://bmv.parts/api/series",
        exampleResponse: JSON.stringify([
          {
            slug: "3-series",
            title: "3 Series",
            chassisCodes: ["E21", "E30", "E36", "E46", "E90", "F30", "G20"],
            vehicleCount: 87,
          },
        ], null, 2),
      },
      {
        method: "GET",
        path: "/api/chassis",
        description: "List all chassis codes in the catalog with vehicle counts.",
        exampleUrl: "https://bmv.parts/api/chassis",
        exampleResponse: JSON.stringify([
          { code: "E46", vehicleCount: 22, seriesSlug: "3-series" },
          { code: "F10", vehicleCount: 18, seriesSlug: "5-series" },
        ], null, 2),
      },
    ],
  },
  {
    title: "VIN Decoder",
    description: "Decode any 17-character VIN. No key required for the standard decode endpoints.",
    endpoints: [
      {
        method: "GET",
        path: "/api/vin/decode/:vin",
        description: "Decode a VIN and attempt to match it to catalog vehicles.",
        params: [{ name: "vin", description: "17-character VIN (case-insensitive)" }],
        exampleUrl: "https://bmv.parts/api/vin/decode/WBAFR72030C958857",
        exampleResponse: JSON.stringify({
          decoded: {
            vin: "WBAFR72030C958857",
            isValid: true,
            validationErrors: [],
            isBmw: true,
            manufacturer: "BMW AG",
            wmi: "WBA",
            vds: "FR7203",
            vis: "0C958857",
            modelYear: 2012,
            chassis: "F10",
            series: "5 Series",
            bodyType: "Sedan",
            engine: "N55B30",
            driveType: "RWD",
            plant: { code: "M", city: "Munich", country: "Germany" },
          },
          matchedCars: [
            {
              id: 312,
              slug: "f10-535i-sedan",
              displayName: "F10 535i Sedan",
              totalParts: 22104,
            },
          ],
          totalCatalogMatches: 1,
          decodeStatus: "matched",
        }, null, 2),
      },
      {
        method: "POST",
        path: "/api/vin/decode",
        description: "Same as GET decode but accepts the VIN in a JSON request body.",
        exampleUrl: "https://bmv.parts/api/vin/decode",
        exampleRequestBody: JSON.stringify({ vin: "WBAFR72030C958857" }, null, 2),
        exampleResponse: JSON.stringify({
          decoded: {
            vin: "WBAFR72030C958857",
            isValid: true,
            validationErrors: [],
            isBmw: true,
            manufacturer: "BMW AG",
            wmi: "WBA",
            vds: "FR7203",
            vis: "0C958857",
            modelYear: 2012,
            chassis: "F10",
            series: "5 Series",
            bodyType: "Sedan",
            engine: "N55B30",
            driveType: "RWD",
            plant: { code: "M", city: "Munich", country: "Germany" },
          },
          matchedCars: [
            { id: 312, slug: "f10-535i-sedan", displayName: "F10 535i Sedan", totalParts: 22104 },
          ],
          totalCatalogMatches: 1,
          decodeStatus: "matched",
        }, null, 2),
      },
      {
        method: "GET",
        path: "/api/vin/bimmerwork/:vin",
        description: "Fetch BMW-enriched vehicle data: options, paint, production date, and owner's manuals. Calls BMW's first-party sources; slow on first lookup.",
        params: [{ name: "vin", description: "17-character BMW VIN" }],
        exampleUrl: "https://bmv.parts/api/vin/bimmerwork/WBAFR72030C958857",
        exampleResponse: JSON.stringify({
          found: true,
          data: {
            vehicle: {
              vin: "WBAFR72030C958857",
              chassis: "F10",
              market: "EU",
              engine: "N55B30",
              color: "Alpine White",
              colorCode: "300",
              startOfProduction: "2012-02",
            },
            options: [
              { code: "P337A", nameEn: "M Sport Package" },
            ],
            images: {
              exteriorUrl: "https://…/exterior.jpg",
              interiorUrl: null,
              exterior360Urls: [],
            },
            manuals: [
              { number: "01405A09E80", language: "en", date: "2012-03", downloadUrl: "https://…" },
            ],
          },
        }, null, 2),
      },
    ],
  },
  {
    title: "Servicing",
    description: "Fluid and filter specifications for BMW vehicles.",
    endpoints: [
      {
        method: "GET",
        path: "/api/servicing/:vin",
        description: "Return the service fluids and filter specifications for a VIN — engine oil grade, capacity, filter part numbers, and service intervals.",
        params: [{ name: "vin", description: "17-character BMW VIN" }],
        exampleUrl: "https://bmv.parts/api/servicing/WBAFR72030C958857",
        exampleResponse: JSON.stringify({
          vin: "WBAFR72030C958857",
          chassis: "F10",
          engine: "N55B30",
          fluids: [
            {
              type: "Engine Oil",
              spec: "BMW Longlife-01",
              viscosity: "0W-30 or 5W-30",
              capacityLitres: 6.5,
              partNumber: "83212365946",
            },
          ],
          filters: [
            {
              type: "Oil Filter",
              partNumber: "11427953125",
              intervalKm: 15000,
            },
          ],
        }, null, 2),
      },
    ],
  },
  {
    title: "Vendor — AI Photo Quotes",
    description: "Create and manage AI-generated damage quotes from accident photos. All endpoints require a session cookie (sign in at /auth). Access is restricted to paid subscribers and admins.",
    endpoints: [
      {
        method: "POST",
        path: "/api/vendor/photo-quote",
        description: "Submit accident photos for GPT-4o vision analysis. The AI identifies damaged parts, matches them against 5.97M+ OEM part numbers with AUD pricing, and returns an editable quote. The quote is persisted and optionally forwarded to MPerformance.parts.",
        exampleUrl: "https://bmv.parts/api/vendor/photo-quote",
        exampleRequestBody: JSON.stringify({
          vehicle: "G80 M3 Competition",
          vin: "WBSAS010X0CY12345",
          photos: ["data:image/jpeg;base64,/9j/4AAQ…"],
          vehicleYear: "2023",
          vehicleColour: "Black Sapphire Metallic",
          customerName: "Jane Smith",
          customerEmail: "jane@example.com",
          customerPhone: "+61 412 345 678",
          customerPostcode: "2000",
        }, null, 2),
        exampleResponse: JSON.stringify({
          quote_id: 17,
          quote_ref: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          vehicle: "G80 M3 Competition",
          vin: "WBSAS010X0CY12345",
          detected_parts: [
            {
              id: "uuid-here",
              estimateItem: "Item 1",
              oemDescription: "Front Bumper Cover M3 Competition",
              oemNumber: "51-11-8-053-346",
              bmwNew: 2450,
              ourPrice: 1225,
              saving: 1225,
              category: "Front Clip",
              status: "required",
            },
          ],
          analysis_notes: [
            { damage_location: "Front Centre", notes: "Possible radiator support damage — verify on disassembly", status: "review" },
          ],
          total_bmw_new: 12800,
          total_our_price: 6400,
          total_saving: 6400,
          csv_url: null,
        }, null, 2),
      },
      {
        method: "GET",
        path: "/api/vendor/photo-quote",
        description: "List all quotes created by the authenticated user, ordered newest-first. The `aiAnalysisJson` raw field is omitted for brevity.",
        exampleUrl: "https://bmv.parts/api/vendor/photo-quote",
        exampleResponse: JSON.stringify([
          {
            id: 17,
            quoteRef: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            vehicle: "G80 M3 Competition",
            vin: "WBSAS010X0CY12345",
            totalBmwNew: 12800,
            totalOurPrice: 6400,
            totalSaving: 6400,
            customerName: "Jane Smith",
            mperformanceRef: "MPF-00042",
            createdAt: "2026-06-03T10:00:00.000Z",
          },
        ], null, 2),
      },
      {
        method: "GET",
        path: "/api/vendor/photo-quote/:id",
        description: "Fetch a single quote by numeric ID, including the full AI analysis JSON and all quote rows.",
        params: [{ name: "id", description: "Numeric quote ID returned from POST" }],
        exampleUrl: "https://bmv.parts/api/vendor/photo-quote/17",
        exampleResponse: JSON.stringify({
          id: 17,
          quoteRef: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          vehicle: "G80 M3 Competition",
          quoteRows: [
            {
              id: "uuid",
              estimateItem: "Item 1",
              oemDescription: "Front Bumper Cover M3 Competition",
              oemNumber: "51-11-8-053-346",
              bmwNew: 2450,
              ourPrice: 1225,
              saving: 1225,
              category: "Front Clip",
              status: "required",
            },
          ],
          totalBmwNew: 12800,
          totalOurPrice: 6400,
          totalSaving: 6400,
        }, null, 2),
      },
      {
        method: "POST",
        path: "/api/vendor/photo-quote/:id/rows",
        description: "Replace all rows on a saved quote (after editing in the UI) and recalculate totals. Returns the updated quote.",
        params: [{ name: "id", description: "Numeric quote ID" }],
        exampleUrl: "https://bmv.parts/api/vendor/photo-quote/17/rows",
        exampleRequestBody: JSON.stringify({
          quoteRows: [
            {
              id: "uuid",
              estimateItem: "Item 1",
              oemDescription: "Front Bumper Cover M3 Competition",
              oemNumber: "51-11-8-053-346",
              bmwNew: 2450,
              ourPrice: 1225,
              saving: 1225,
              category: "Front Clip",
              status: "required",
            },
          ],
        }, null, 2),
        exampleResponse: JSON.stringify({ id: 17, totalBmwNew: 2450, totalOurPrice: 1225, totalSaving: 1225 }, null, 2),
      },
      {
        method: "GET",
        path: "/api/vendor/photo-quote/:id/csv",
        description: "Generate and download a CSV in M Performance Parts format (UTF-8 BOM). Also triggers MPerformance.parts lead submission if not already sent. The response is a file download with Content-Disposition: attachment.",
        params: [{ name: "id", description: "Numeric quote ID" }],
        exampleUrl: "https://bmv.parts/api/vendor/photo-quote/17/csv",
        exampleResponse: `"ESTIMATE ITEM","OEM DESCRIPTION","OEM PART NUMBER","BMW NEW (AUD)","OUR PRICE (AUD)","SAVING (AUD)","CATEGORY","STATUS"\n"Item 1","Front Bumper Cover M3 Competition","51-11-8-053-346","2450.00","1225.00","1225.00","Front Clip","required"`,
      },
    ],
  },
];

const AUTHENTICATED_SECTION = {
  title: "Authenticated — VIN Decode (API Key)",
  description:
    "Higher-throughput VIN decoding for developers and integrations. Requires an API key sent in the Authorization header.",
  endpoint: {
    method: "GET" as const,
    path: "/api/v1/vin/decode/:vin",
    description: "Full VIN decode with catalog matching. Identical response shape to the public endpoint but served under a keyed quota.",
    params: [{ name: "vin", description: "17-character VIN (case-insensitive)" }],
    exampleUrl: "https://bmv.parts/api/v1/vin/decode/WBAFR72030C958857",
    exampleResponse: JSON.stringify({
      decoded: { vin: "WBAFR72030C958857", isValid: true, chassis: "F10", modelYear: 2012 },
      matchedCars: [{ id: 312, slug: "f10-535i-sedan", totalParts: 22104 }],
      decodeStatus: "matched",
    }, null, 2),
  },
  rateLimits: [
    { tier: "paid", label: "Paid", limit: "240 requests / minute" },
    { tier: "basic", label: "Basic", limit: "30 requests / minute" },
  ],
};

function MethodBadge({ method }: { method: "GET" | "POST" }) {
  const color =
    method === "GET"
      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
      : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold shrink-0 ${color}`}
      data-testid={`badge-method-${method}`}
    >
      {method}
    </span>
  );
}

function CodeBlock({ code, language = "json" }: { code: string; language?: string }) {
  return (
    <pre
      className="bg-muted rounded-md p-4 text-xs font-mono overflow-x-auto whitespace-pre leading-relaxed text-foreground/80"
      data-testid="code-block"
    >
      <code>{code}</code>
    </pre>
  );
}

function EndpointRow({ endpoint }: { endpoint: Endpoint }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="border rounded-lg overflow-hidden"
      data-testid={`endpoint-${endpoint.method.toLowerCase()}-${endpoint.path.replace(/[/:]/g, "-")}`}
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        data-testid="button-toggle-endpoint"
        aria-expanded={open}
      >
        <MethodBadge method={endpoint.method} />
        <div className="flex-1 min-w-0">
          <span className="font-mono text-sm text-foreground">{endpoint.path}</span>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{endpoint.description}</p>
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t px-4 py-4 space-y-4 bg-background">
          {endpoint.params && endpoint.params.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Path Parameters</div>
              <div className="space-y-1">
                {endpoint.params.map(p => (
                  <div key={p.name} className="flex items-start gap-2 text-sm">
                    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">:{p.name}</code>
                    <span className="text-muted-foreground text-xs">{p.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {endpoint.queryParams && endpoint.queryParams.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Query Parameters</div>
              <div className="space-y-1">
                {endpoint.queryParams.map(p => (
                  <div key={p.name} className="flex items-start gap-2 text-sm">
                    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">{p.name}</code>
                    <span className="text-muted-foreground text-xs">{p.description}{p.example && <> — example: <span className="font-mono">{p.example}</span></>}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Example Request</div>
            <CodeBlock
              code={endpoint.method === "POST"
                ? `curl -X POST ${endpoint.exampleUrl} \\\n  -H "Content-Type: application/json" \\\n  -d '${endpoint.exampleRequestBody ?? "{}"}'`
                : `curl ${endpoint.exampleUrl}`}
              language="bash"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Example Response Shape</div>
            <CodeBlock code={endpoint.exampleResponse} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ApiDocs() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10" data-testid="page-api-docs">
      <SEO
        title="BMW Parts API Reference"
        description="Public REST API documentation for BMV.parts — browse the BMW parts catalog, search parts, decode VINs, and look up service fluids. No API key required for catalog and VIN endpoints."
        path="/api-docs"
      />

      {/* Hero */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10">
            <Terminal className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-api-docs">
              API Reference
            </h1>
            <p className="text-sm text-muted-foreground">BMW Parts Catalog — Public Endpoints</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
          All catalog, search, VIN, and servicing endpoints listed here are openly accessible — no account or
          API key required. Admin, garage, auth, scraping, backup, and pricing-sync endpoints are not documented
          here. The base URL for all endpoints is{" "}
          <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">https://bmv.parts</code>.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
            All responses are JSON
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-muted">
            No authentication required for public endpoints
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-muted">
            CORS enabled
          </span>
        </div>
      </div>

      {/* Public endpoint sections */}
      {SECTIONS.map(section => (
        <section key={section.title} data-testid={`section-${section.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}>
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <Code2 className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold text-base">{section.title}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{section.description}</p>
          </div>
          <div className="space-y-2">
            {section.endpoints.map(ep => (
              <EndpointRow key={`${ep.method}-${ep.path}`} endpoint={ep} />
            ))}
          </div>
        </section>
      ))}

      {/* Authenticated section */}
      <section
        className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 p-6 space-y-4"
        data-testid="section-authenticated"
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 shrink-0">
            <Key className="w-4 h-4 text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="font-semibold text-base">{AUTHENTICATED_SECTION.title}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{AUTHENTICATED_SECTION.description}</p>
          </div>
        </div>

        {/* Auth header */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Required Header</div>
          <CodeBlock code={`Authorization: Bearer <your-api-key>`} language="http" />
        </div>

        {/* Rate limit tiers */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Rate Limit Tiers</div>
          <div className="flex flex-wrap gap-3">
            {AUTHENTICATED_SECTION.rateLimits.map(tier => (
              <div
                key={tier.tier}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-background text-sm"
                data-testid={`rate-limit-${tier.tier}`}
              >
                <Badge variant={tier.tier === "paid" ? "default" : "secondary"} className="text-xs">
                  {tier.label}
                </Badge>
                <span className="font-mono text-xs">{tier.limit}</span>
              </div>
            ))}
          </div>
        </div>

        {/* The endpoint itself */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Endpoint</div>
          <div className="border rounded-lg overflow-hidden bg-background">
            <div className="flex items-start gap-3 px-4 py-3">
              <MethodBadge method={AUTHENTICATED_SECTION.endpoint.method} />
              <div className="flex-1 min-w-0">
                <span className="font-mono text-sm">{AUTHENTICATED_SECTION.endpoint.path}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{AUTHENTICATED_SECTION.endpoint.description}</p>
              </div>
            </div>
            <div className="border-t px-4 py-4 space-y-4">
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Example Request</div>
                <CodeBlock
                  code={`curl ${AUTHENTICATED_SECTION.endpoint.exampleUrl} \\\n  -H "Authorization: Bearer bmvk_your_api_key_here"`}
                  language="bash"
                />
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Example Response Shape</div>
                <CodeBlock code={AUTHENTICATED_SECTION.endpoint.exampleResponse} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
