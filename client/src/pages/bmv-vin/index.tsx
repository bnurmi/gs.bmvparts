// =============================================================================
// bmv.vin — client pages (DESIGN2.md, 2026-06-25)
// Self-contained: does NOT share styling with bmv.parts.
// Uses POST /api/vin/decode and GET /api/vin/bimmerwork/:vin only.
// =============================================================================

import { Link, useLocation, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { Loader2 } from "lucide-react";
import { AiFaqSection } from "@/components/AiFaqSection";
import VinDecoder from "@/pages/VinDecoder";
import {
  BMV_VIN_BRANDS, BMV_VIN_FACET_KINDS, BRAND_LABEL, FACET_KIND_LABEL,
  type BmvVinBrand, type BmvVinFacetKind,
} from "../../../../shared/bmv-vin/feature-registry";

// =============================================================================
// Tokens (inline — no Tailwind, no shadcn)
// =============================================================================
const C = {
  blue:      "#1C69D4",
  blueDark:  "#0F4FA8",
  blueMid:   "#3578D8",
  blueTint:  "#EBF1FB",
  ink:       "#0A0A0C",
  ink3:      "#3D3D48",
  ink4:      "#6B6B7A",
  ink5:      "#9898A8",
  white:     "#FFFFFF",
  surface:   "#F7F7FA",
  rule:      "#E2E2EA",
  ruleMid:   "#CCCCD8",
  green:     "#0A7A3E",
  greenTint: "#E8F5EE",
  red:       "#C41C24",
  redTint:   "#FDF0F0",
  segWMI:    "#3578D8",
  segVDS:    "#5C6FAA",
  segCHK:    "#9A5A00",
  segVIS:    "#3A9A99",
} as const;

const F = {
  sans: "Inter, system-ui, -apple-system, sans-serif",
  mono: "'Space Mono', ui-monospace, monospace",
} as const;

// =============================================================================
// Shared layout
// =============================================================================

function SiteHeader() {
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50, height: 58,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 48px",
      background: "rgba(255,255,255,0.92)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      borderBottom: `1px solid ${C.rule}`,
    }}>
      <Link href="/" style={{ textDecoration: "none" }}>
        <span style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em", color: C.ink }}>
          bmv<span style={{ color: C.blue }}>.vin</span>
        </span>
      </Link>
      <nav style={{ display: "flex", gap: 24 }}>
        {[["How it works", "#how-it-works"], ["Style guide", "/guide"]].map(([label, href]) => (
          <a key={label} href={href} style={{
            fontFamily: F.sans, fontWeight: 500, fontSize: 13.5,
            color: C.ink4, textDecoration: "none",
          }}
            onMouseEnter={e => (e.target as HTMLElement).style.color = C.ink}
            onMouseLeave={e => (e.target as HTMLElement).style.color = C.ink4}
          >{label}</a>
        ))}
      </nav>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer style={{
      background: C.ink, padding: "32px 48px",
      display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
    }}>
      <span style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 15, color: C.white }}>
        bmv<span style={{ color: C.blueMid }}>.vin</span>
      </span>
      <span style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,0.30)" }}>
        Vehicle identification data for reference purposes only.
      </span>
    </footer>
  );
}

function PageShell({ children, bg = C.white }: { children: React.ReactNode; bg?: string }) {
  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column" }}>
      <SiteHeader />
      <main style={{ flex: 1 }}>{children}</main>
      <SiteFooter />
    </div>
  );
}

// =============================================================================
// VIN Cell Instrument — full segmented input per DESIGN2.md
// =============================================================================

const SEG_CONFIG = [
  { key: "WMI", label: "WMI", name: "World Manufacturer", color: C.segWMI, positions: [0,1,2] },
  { key: "VDS", label: "VDS", name: "Vehicle Descriptor", color: C.segVDS, positions: [3,4,5,6,7] },
  { key: "CHK", label: "CHK", name: "Check digit",        color: C.segCHK, positions: [8] },
  { key: "VIS", label: "VIS", name: "Vehicle Identifier", color: C.segVIS, positions: [9,10,11,12,13,14,15,16] },
] as const;

const SEG_FLEX: Record<string, number> = { WMI: 3, VDS: 5, CHK: 1, VIS: 8 };

interface CellInstrumentProps {
  value: string;
  onChange: (v: string) => void;
  onDecode: () => void;
  isDecoding: boolean;
}

function CellInstrument({ value, onChange, onDecode, isDecoding }: CellInstrumentProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const chars = value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "").slice(0, 17).split("");
  const count = chars.length;
  const isReady = count === 17;
  const [focused, setFocused] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isReady && !isDecoding) onDecode();
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 820, margin: "0 auto" }}>
      {/* Panel */}
      <div style={{
        background: C.white,
        border: `1.5px solid ${focused ? C.blue : C.ruleMid}`,
        borderRadius: 16,
        padding: "28px 28px 20px",
        boxShadow: focused
          ? `0 0 0 4px rgba(28,105,212,0.10), 0 2px 12px rgba(0,0,0,0.06)`
          : "0 2px 12px rgba(0,0,0,0.06)",
        transition: "border-color 0.15s, box-shadow 0.15s",
        position: "relative",
      }}>
        {/* Hidden real input for keyboard entry */}
        <input
          ref={inputRef}
          value={value}
          onChange={e => onChange(e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "").slice(0, 17))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            position: "absolute", opacity: 0, width: 1, height: 1,
            pointerEvents: "none",
          }}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          data-testid="input-vin-hidden"
        />

        {/* Segment columns — flex-end so cells always sit on same baseline */}
        <div
          style={{ display: "flex", gap: 10, cursor: "text", alignItems: "flex-end" }}
          onClick={() => inputRef.current?.focus()}
        >
          {SEG_CONFIG.map(seg => (
            <div key={seg.key} style={{ flex: SEG_FLEX[seg.key] }}>
              {/* Segment header */}
              <div style={{ borderBottom: `2px solid ${seg.color}`, paddingBottom: 6, marginBottom: 8 }}>
                <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: seg.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {seg.label}
                </div>
                <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 400, color: C.ink5 }}>
                  {seg.name}
                </div>
              </div>
              {/* Cells */}
              <div style={{ display: "flex", gap: 3 }}>
                {seg.positions.map((pos, ci) => {
                  const ch = chars[pos] ?? "";
                  const isCursor = focused && pos === count;
                  const isFilled = !!ch;
                  return (
                    <div key={ci} style={{
                      flex: 1,
                      height: 50,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      position: "relative",
                      background: isFilled ? C.white : C.surface,
                      border: `1.5px solid ${isCursor ? C.blue : isFilled ? C.ruleMid : C.rule}`,
                      borderRadius: 6,
                      boxShadow: isCursor ? "0 0 0 3px rgba(28,105,212,0.12)" : "none",
                      transition: "border-color 0.1s",
                    }}>
                      {/* Position number */}
                      <span style={{
                        position: "absolute", top: 3, right: 4,
                        fontFamily: F.sans, fontSize: 7, fontWeight: 500, color: C.ink5,
                      }}>{pos + 1}</span>
                      {/* Character */}
                      <span style={{
                        fontFamily: F.mono, fontSize: 17, fontWeight: 700, color: C.ink,
                      }}>{ch}</span>
                      {/* Cursor bar */}
                      {isCursor && (
                        <span style={{
                          position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
                          width: 1.5, height: 18, background: C.blue,
                          animation: "blink 1s step-end infinite",
                        }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer row: char counter */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <span style={{
            fontFamily: F.mono, fontSize: 11,
            color: isReady ? C.green : C.ink5,
            transition: "color 0.15s",
          }}>
            {count} / 17
          </span>
        </div>
      </div>

      {/* Decode button */}
      <button
        type="submit"
        disabled={!isReady || isDecoding}
        data-testid="button-decode"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          width: "100%", maxWidth: 820, margin: "12px auto 0",
          height: 54,
          background: isReady && !isDecoding ? C.blue : C.ruleMid,
          color: isReady && !isDecoding ? C.white : C.ink5,
          fontFamily: F.sans, fontWeight: 700, fontSize: 15, letterSpacing: "0.04em",
          border: "none", borderRadius: 10,
          boxShadow: isReady && !isDecoding ? "0 1px 4px rgba(28,105,212,0.20)" : "none",
          cursor: isReady && !isDecoding ? "pointer" : "not-allowed",
          transition: "background 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={e => { if (isReady && !isDecoding) (e.currentTarget as HTMLElement).style.background = C.blueDark; }}
        onMouseLeave={e => { if (isReady && !isDecoding) (e.currentTarget as HTMLElement).style.background = C.blue; }}
      >
        {isDecoding ? (
          <>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
              <circle cx="8" cy="8" r="6" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" />
              <path d="M8 2a6 6 0 0 1 6 6" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            Decoding VIN
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Decode VIN
          </>
        )}
      </button>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </form>
  );
}

// =============================================================================
// Segment Breakdown Table (results)
// =============================================================================

interface DecodedVin {
  vin: string; wmi: string; vds: string; vis: string;
  manufacturer: string | null; chassis: string | null; series: string | null;
  modelYear: number | null; plant: { code: string; city: string; country: string } | null;
  isValid: boolean; validationErrors: string[];
  productionSequence: string | null;
}

function SegmentBreakdown({ decoded }: { decoded: DecodedVin }) {
  const segments = [
    { label: "WMI", name: "World Manufacturer",   chars: decoded.wmi || decoded.vin.slice(0,3),  range: "Pos 1 to 3",   color: C.segWMI, interp: decoded.manufacturer ?? "" },
    { label: "VDS", name: "Vehicle Descriptor",   chars: decoded.vds || decoded.vin.slice(3,8),  range: "Pos 4 to 8",   color: C.segVDS, interp: [decoded.chassis, decoded.series].filter(Boolean).join(" · ") },
    { label: "CHK", name: "Check digit",          chars: decoded.vin[8] ?? "",                   range: "Pos 9",         color: C.segCHK, interp: decoded.isValid ? "Valid" : "Structural check" },
    { label: "VIS", name: "Vehicle Identifier",   chars: decoded.vis || decoded.vin.slice(9),    range: "Pos 10 to 17", color: C.segVIS, interp: decoded.modelYear ? `Model year ${decoded.modelYear}` : "" },
  ];

  return (
    <div style={{ border: `1px solid ${C.rule}`, borderRadius: 10, overflow: "hidden", fontFamily: F.sans }}>
      {/* Header row */}
      <div style={{ background: C.surface, display: "grid", gridTemplateColumns: "80px 140px 1fr 1fr", gap: 16, padding: "8px 22px" }}>
        {["Position", "Segment", "Characters", "Interpretation"].map(h => (
          <div key={h} style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.10em", color: C.ink4 }}>{h}</div>
        ))}
      </div>
      {/* Data rows */}
      {segments.map(s => (
        <div key={s.label}
          style={{ display: "grid", gridTemplateColumns: "80px 140px 1fr 1fr", gap: 16, padding: "14px 22px", borderTop: `1px solid ${C.rule}`, background: C.white, transition: "background 0.1s" }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.surface}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = C.white}
        >
          <div style={{ fontFamily: F.mono, fontSize: 10, color: C.ink5 }}>{s.range}</div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: C.ink4 }}>{s.label}</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {s.chars.split("").map((ch, i) => (
              <div key={i} style={{
                width: 30, height: 30,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: `1.5px solid ${C.ruleMid}`,
                borderRadius: 3,
                fontFamily: F.mono, fontSize: 13, fontWeight: 700,
                color: s.color,
              }}>{ch}</div>
            ))}
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 300, color: C.ink3, lineHeight: 1.5 }}>
            {s.interp || s.name}
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Data Cards Grid (results)
// =============================================================================

function DataCard({ label, value, sub, primary }: { label: string; value: string; sub?: string; primary?: boolean }) {
  return (
    <div style={{
      background: primary ? C.blue : C.surface,
      border: `1px solid ${primary ? "transparent" : C.rule}`,
      borderRadius: 10, padding: "20px 22px",
    }}>
      <div style={{ fontFamily: F.sans, fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.10em", color: primary ? "rgba(255,255,255,0.65)" : C.ink5, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: F.sans, fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.15, color: primary ? C.white : C.ink }}>
        {value || "—"}
      </div>
      {sub && (
        <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 300, color: primary ? "rgba(255,255,255,0.55)" : C.ink5, marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Validity Pill
// =============================================================================

function ValidityPill({ isValid }: { isValid: boolean }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: isValid ? C.greenTint : C.redTint,
      color: isValid ? C.green : C.red,
      border: `1px solid ${isValid ? "#B8E3CC" : "#F5C5C7"}`,
      borderRadius: 20, padding: "7px 14px",
      fontFamily: F.sans, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em",
    }}>
      {isValid ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke={C.green} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke={C.red} strokeWidth="1.5" strokeLinecap="round"/></svg>
      )}
      {isValid ? "Valid VIN" : "Invalid VIN"}
    </span>
  );
}

// =============================================================================
// bmv.vin VIN Decoder — self-contained results page
// =============================================================================

interface DecodeResponse {
  decoded: DecodedVin & { isBmw: boolean };
  matchedCars: { id: number; chassis: string; modelName: string; slug: string; totalParts: number }[];
  decodeStatus?: string;
}

interface BwVehicle {
  modelName: string | null; manufacturer: string | null; chassis: string | null;
  engine: string | null; color: string | null; colorCode: string | null;
  market: string | null; startOfProduction: string | null; drivetrain: string | null;
}

interface BwResponse {
  found: boolean;
  data?: { vehicle: BwVehicle | null; options: { code: string; description: string }[] };
}

function BmvVinDecoder({ vin }: { vin: string }) {
  const qc = useQueryClient();
  const [result, setResult] = useState<DecodeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const [inputVin, setInputVin] = useState(vin);

  const decodeMutation = useMutation<DecodeResponse, Error, string>({
    mutationFn: async (v: string) => {
      const res = await fetch("/api/vin/decode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin: v }),
      });
      if (!res.ok) throw new Error(`Decode failed: ${res.status}`);
      return res.json();
    },
    onSuccess: (data) => { setResult(data); setError(null); },
    onError: (e) => setError(e.message),
  });

  // Auto-decode on mount / vin change
  useEffect(() => {
    if (vin && vin.length === 17) {
      setInputVin(vin);
      decodeMutation.mutate(vin);
    }
  }, [vin]);

  const bwQuery = useQuery<BwResponse>({
    queryKey: ["/api/vin/bimmerwork", result?.decoded.vin],
    queryFn: async () => {
      const res = await fetch(`/api/vin/bimmerwork/${result!.decoded.vin}`);
      return res.json();
    },
    enabled: !!result?.decoded.vin && !!result?.decoded.isBmw,
    staleTime: 5 * 60_000,
  });

  const bw = bwQuery.data?.data;
  const decoded = result?.decoded;

  function handleDecode() {
    const clean = inputVin.replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase();
    if (clean.length === 17) {
      navigate(`/${clean}`);
      decodeMutation.mutate(clean);
    }
  }

  const modelYear = bw?.vehicle?.startOfProduction
    ? parseInt(bw.vehicle.startOfProduction.match(/(\d{4})/)?.[1] ?? "0", 10) || decoded?.modelYear
    : decoded?.modelYear;

  return (
    <PageShell bg={C.white}>
      <Helmet>
        <title>{vin} — VIN Decoder | bmv.vin</title>
      </Helmet>

      {/* Hero — white, instrument + decode */}
      <section style={{
        background: C.white, padding: "64px 48px 56px",
        borderBottom: `1px solid ${C.rule}`,
        display: "flex", flexDirection: "column", alignItems: "center",
      }}>
        <div style={{ width: "100%", maxWidth: 820 }}>
          <CellInstrument
            value={inputVin}
            onChange={setInputVin}
            onDecode={handleDecode}
            isDecoding={decodeMutation.isPending}
          />
        </div>
      </section>

      {/* Results */}
      <section style={{ padding: "48px 48px 72px", maxWidth: 900, margin: "0 auto", width: "100%" }}>

        {/* Error */}
        {error && (
          <div style={{
            background: C.redTint, border: `1px solid #F5C5C7`,
            borderRadius: 10, padding: "16px 20px", marginBottom: 24,
          }}>
            <div style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 14, color: C.red, marginBottom: 4 }}>Decode failed</div>
            <div style={{ fontFamily: F.sans, fontWeight: 300, fontSize: 13.5, color: C.ink3 }}>{error}</div>
          </div>
        )}

        {/* Loading */}
        {decodeMutation.isPending && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "32px 0", color: C.ink4 }}>
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}>
              <circle cx="18" cy="18" r="15" stroke={C.rule} strokeWidth="2.5" />
              <path d="M18 3a15 15 0 0 1 15 15" stroke={C.blue} strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <span style={{ fontFamily: F.sans, fontWeight: 500, fontSize: 15, color: C.ink4 }}>Decoding VIN</span>
          </div>
        )}

        {decoded && !decodeMutation.isPending && (
          <>
            {/* VIN string + validity */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32, flexWrap: "wrap" }}>
              <span style={{ fontFamily: F.mono, fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: "0.06em" }}>
                {decoded.vin}
              </span>
              <ValidityPill isValid={decoded.isValid} />
              {bwQuery.isLoading && (
                <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 500, color: C.ink5, display: "flex", alignItems: "center", gap: 6 }}>
                  <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> Enriching
                </span>
              )}
            </div>

            {/* Validation warnings */}
            {decoded.validationErrors.length > 0 && (
              <div style={{ background: "#FFFBF0", border: "1px solid #F0D080", borderRadius: 10, padding: "12px 18px", marginBottom: 24 }}>
                {decoded.validationErrors.map((e, i) => (
                  <div key={i} style={{ fontFamily: F.sans, fontWeight: 300, fontSize: 13.5, color: C.ink3 }}>{e}</div>
                ))}
              </div>
            )}

            {/* Data cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 32 }}>
              <DataCard
                label="Manufacturer"
                value={bw?.vehicle?.manufacturer || decoded.manufacturer || ""}
                sub={decoded.wmi}
                primary
              />
              <DataCard
                label="Chassis"
                value={bw?.vehicle?.chassis || decoded.chassis || ""}
                sub={decoded.series || undefined}
              />
              <DataCard
                label="Model year"
                value={modelYear ? String(modelYear) : ""}
              />
              <DataCard
                label="Plant"
                value={decoded.plant ? decoded.plant.city : ""}
                sub={decoded.plant ? decoded.plant.country : undefined}
              />
              <DataCard
                label="Engine"
                value={bw?.vehicle?.engine || decoded.chassis || ""}
              />
              <DataCard
                label="Market"
                value={bw?.vehicle?.market || ""}
              />
              {bw?.vehicle?.color && (
                <DataCard
                  label="Colour"
                  value={bw.vehicle.color}
                  sub={bw.vehicle.colorCode || undefined}
                />
              )}
              {decoded.productionSequence && (
                <DataCard
                  label="Production sequence"
                  value={decoded.productionSequence}
                />
              )}
            </div>

            {/* Segment breakdown */}
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em", color: C.ink, margin: "0 0 16px" }}>
                VIN structure
              </h2>
              <SegmentBreakdown decoded={decoded} />
            </div>

            {/* Options */}
            {bw?.options && bw.options.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <h2 style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em", color: C.ink, margin: "0 0 16px" }}>
                  Factory options
                </h2>
                <div style={{ border: `1px solid ${C.rule}`, borderRadius: 10, overflow: "hidden" }}>
                  {bw.options.map((opt, i) => (
                    <div key={i} style={{
                      display: "grid", gridTemplateColumns: "80px 1fr",
                      gap: 16, padding: "12px 22px",
                      borderTop: i > 0 ? `1px solid ${C.rule}` : "none",
                      background: C.white, transition: "background 0.1s",
                    }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.surface}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = C.white}
                    >
                      <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, color: C.blue }}>{opt.code}</div>
                      <div style={{ fontFamily: F.sans, fontSize: 13.5, fontWeight: 300, color: C.ink3 }}>{opt.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Parts catalog links */}
            {result?.matchedCars && result.matchedCars.length > 0 && (
              <div>
                <h2 style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em", color: C.ink, margin: "0 0 16px" }}>
                  OEM parts catalog
                </h2>
                <div style={{ display: "grid", gap: 8 }}>
                  {result.matchedCars.map(car => (
                    <a key={car.id} href={`https://dev-syd-01.bmv.parts/car/${car.slug}`}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "14px 20px",
                        border: `1px solid ${C.rule}`, borderRadius: 10,
                        background: C.white, textDecoration: "none",
                        transition: "border-color 0.12s, background 0.12s",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.ruleMid; (e.currentTarget as HTMLElement).style.background = C.surface; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.rule; (e.currentTarget as HTMLElement).style.background = C.white; }}
                    >
                      <span style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 500, color: C.ink }}>
                        {car.chassis} {car.modelName}
                      </span>
                      <span style={{ fontFamily: F.mono, fontSize: 12, color: C.ink5 }}>
                        {car.totalParts.toLocaleString()} parts →
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </PageShell>
  );
}

// =============================================================================
// DecoderHome — Variant B (DESIGN2.md corrected spec)
// White hero + cell instrument, then surface browse block
// =============================================================================

export function DecoderHome() {
  const [vinInput, setVinInput] = useState("");
  const [, navigate] = useLocation();

  function handleDecode() {
    const clean = vinInput.replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase();
    if (clean.length === 17) navigate(`/${clean}`);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Helmet><title>VIN Decoder for BMW Group — bmv.vin</title></Helmet>
      <SiteHeader />
      <main style={{ flex: 1 }}>

        {/* Hero — white */}
        <section style={{
          background: C.white, padding: "88px 48px 72px",
          borderBottom: `1px solid ${C.rule}`,
          display: "flex", flexDirection: "column", alignItems: "center",
          textAlign: "center",
        }}>
          {/* Kicker */}
          <div style={{
            fontFamily: F.sans, fontSize: 11, fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.14em",
            color: C.blue, marginBottom: 22,
          }}>
            Vehicle Identification Number Intelligence
          </div>

          {/* Headline */}
          <h1 style={{
            fontFamily: F.sans, fontWeight: 700,
            fontSize: "clamp(40px, 6vw, 72px)",
            letterSpacing: "-0.025em", lineHeight: 1.0,
            color: C.ink, margin: "0 0 20px",
          }}>
            Decode any <span style={{ color: C.blue }}>VIN.</span>
          </h1>

          {/* Sub-copy */}
          <p style={{
            fontFamily: F.sans, fontWeight: 300, fontSize: 16,
            lineHeight: 1.65, color: C.ink4,
            maxWidth: 420, margin: "0 0 48px",
          }}>
            BMW, MINI, ALPINA, Rolls-Royce, Motorrad. Authoritative data. No signup required.
          </p>

          {/* Cell instrument */}
          <CellInstrument
            value={vinInput}
            onChange={setVinInput}
            onDecode={handleDecode}
            isDecoding={false}
          />
        </section>

        {/* Browse block — surface */}
        <section style={{
          background: C.surface, borderTop: `1px solid ${C.rule}`,
          padding: "56px 48px 72px",
        }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>

            {/* By brand */}
            <h2 style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 18, letterSpacing: "-0.01em", color: C.ink, margin: "0 0 16px" }}>
              By brand
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 40 }}>
              {BMV_VIN_BRANDS.map(b => (
                <BrowseTile key={b} href={`/decoder/${b}`} label={BRAND_LABEL[b]} testId={`link-brand-${b}`} onSurface />
              ))}
            </div>

            {/* By facet */}
            <h2 style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 18, letterSpacing: "-0.01em", color: C.ink, margin: "0 0 16px" }}>
              By facet
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 28 }}>
              {BMV_VIN_FACET_KINDS.map(k => (
                <BrowseTile key={k} href={`/${k}`} label={FACET_KIND_LABEL[k]} testId={`link-facet-${k}`} onSurface />
              ))}
            </div>

            {/* Footer text links */}
            <div style={{ display: "flex", gap: 16 }}>
              {[["Guide library", "/guide"], ["Glossary", "/glossary"]].map(([label, href]) => (
                <Link key={label} href={href} style={{ fontFamily: F.sans, fontWeight: 400, fontSize: 14, color: C.blue, textDecoration: "none" }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.color = C.blueDark; (e.target as HTMLElement).style.textDecoration = "underline"; }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.color = C.blue; (e.target as HTMLElement).style.textDecoration = "none"; }}
                >{label}</Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

// Browse tile — onSurface uses stronger border
function BrowseTile({ href, label, testId, onSurface }: { href: string; label: string; testId?: string; onSurface?: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link href={href} data-testid={testId} style={{ textDecoration: "none" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: hovered ? C.surface : C.white,
          border: `1px solid ${hovered ? C.ruleMid : onSurface ? C.ruleMid : C.rule}`,
          borderRadius: 10, padding: "18px 16px",
          minHeight: 56, display: "flex", alignItems: "center", justifyContent: "center",
          textAlign: "center",
          fontFamily: F.sans, fontWeight: 400, fontSize: 15, color: C.ink,
          cursor: "pointer", transition: "border-color 0.12s, background 0.12s",
        }}
      >{label}</div>
    </Link>
  );
}

// =============================================================================
// Brand Decoder Hub
// =============================================================================
export function BrandDecoderHub() {
  const [, params] = useRoute("/decoder/:brand");
  const brand = (params?.brand ?? "bmw") as BmvVinBrand;
  const label = BRAND_LABEL[brand] || brand;
  const [vinInput, setVinInput] = useState("");
  const [, navigate] = useLocation();

  function handleDecode() {
    const clean = vinInput.replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase();
    if (clean.length === 17) navigate(`/${clean}`);
  }

  return (
    <PageShell>
      <Helmet><title>{label} VIN Decoder — bmv.vin</title></Helmet>
      <section style={{ padding: "72px 48px 64px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: "100%", maxWidth: 820 }}>
          <Crumb items={[{ label: "Decoder", href: "/" }, { label }]} />
          <h1 style={{ fontFamily: F.sans, fontWeight: 700, fontSize: "clamp(32px, 5vw, 56px)", letterSpacing: "-0.025em", lineHeight: 1.0, color: C.ink, margin: "0 0 16px" }}>
            {label} VIN decoder.
          </h1>
          <p style={{ fontFamily: F.sans, fontWeight: 300, fontSize: 16, lineHeight: 1.65, color: C.ink4, margin: "0 0 40px" }}>
            Decode any {label} VIN. Authoritative data, no signup required.
          </p>
          <CellInstrument value={vinInput} onChange={setVinInput} onDecode={handleDecode} isDecoding={false} />
        </div>
      </section>
    </PageShell>
  );
}

// =============================================================================
// Crumb nav
// =============================================================================
function Crumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24, fontFamily: F.sans, fontSize: 13, color: C.ink4 }}>
      {items.map((it, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {i > 0 && <span style={{ color: C.ruleMid }}>›</span>}
          {it.href
            ? <Link href={it.href} style={{ color: C.ink4, textDecoration: "none" }}>{it.label}</Link>
            : <span style={{ color: C.ink3 }}>{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

// =============================================================================
// BmvVinDecoderPage — wraps the shared VinDecoder in the bmv.vin shell.
// The VinDecoder component handles all data, tabs, enrichment, and FAQ.
// We only provide the shell (header/footer) and pass the VIN as a param.
// =============================================================================

/** Read-only display of a filled VIN in the segment instrument. No interactivity. */
function CellInstrumentReadonly({ vin }: { vin: string }) {
  const chars = vin.toUpperCase().split("");
  return (
    <div style={{ width: "100%", maxWidth: 820 }}>
      <div style={{
        background: C.white,
        border: `1.5px solid ${C.ruleMid}`,
        borderRadius: 16,
        padding: "28px 28px 20px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          {SEG_CONFIG.map(seg => (
            <div key={seg.key} style={{ flex: SEG_FLEX[seg.key] }}>
              <div style={{ borderBottom: `2px solid ${seg.color}`, paddingBottom: 6, marginBottom: 8 }}>
                <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: seg.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{seg.label}</div>
                <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 400, color: C.ink5 }}>{seg.name}</div>
              </div>
              <div style={{ display: "flex", gap: 3 }}>
                {seg.positions.map((pos, ci) => (
                  <div key={ci} style={{
                    flex: 1, height: 50,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    position: "relative",
                    background: C.white, border: `1.5px solid ${C.ruleMid}`, borderRadius: 6,
                  }}>
                    <span style={{ position: "absolute", top: 3, right: 4, fontFamily: F.sans, fontSize: 7, fontWeight: 500, color: C.ink5 }}>{pos + 1}</span>
                    <span style={{ fontFamily: F.mono, fontSize: 17, fontWeight: 700, color: C.ink }}>{chars[pos] ?? ""}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <span style={{ fontFamily: F.mono, fontSize: 11, color: C.green }}>17 / 17</span>
        </div>
      </div>
    </div>
  );
}

export function BmvVinDecoderPage({ vin }: { vin: string }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: C.white }}>
      <Helmet>
        <title>{vin} — VIN Decoder | bmv.vin</title>
      </Helmet>
      <SiteHeader />

      {/* Read-only cell instrument showing the decoded VIN */}
      <section style={{
        background: C.white, padding: "48px 48px 40px",
        borderBottom: `1px solid ${C.rule}`,
        display: "flex", flexDirection: "column", alignItems: "center",
      }}>
        <CellInstrumentReadonly vin={vin} />
      </section>

      {/* Full VinDecoder — all tabs, enrichment, FAQ, everything */}
      <main style={{ flex: 1, padding: "32px 48px" }}>
        <VinDecoder params={{ vin }} />
      </main>

      <SiteFooter />
    </div>
  );
}

// =============================================================================
// Facet Hub
// =============================================================================
export function FacetHub() {
  const [, params] = useRoute("/:kind/:value");
  const [currentPath] = useLocation();
  const kind = (params?.kind ?? "chassis") as BmvVinFacetKind;
  const value = params?.value ?? "";
  const label = FACET_KIND_LABEL[kind] || kind;
  const localeMatch = currentPath.match(/^\/([a-z]{2}(?:-[A-Z]{2})?)\//);
  const locale = localeMatch ? localeMatch[1] : "en";

  return (
    <PageShell>
      <Helmet><title>{label} {value} — bmv.vin</title></Helmet>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px" }}>
        <Crumb items={[{ label: "Decoder", href: "/" }, { label, href: `/${kind}` }, { label: value }]} />
        <h1 style={{ fontFamily: F.sans, fontWeight: 700, fontSize: "clamp(28px, 4vw, 48px)", letterSpacing: "-0.025em", lineHeight: 1.0, color: C.ink, margin: "0 0 32px" }}>
          {label}: {value}.
        </h1>
        {kind && value && <AiFaqSection pageType="facet" pageKey={`${kind}:${value.toLowerCase()}`} locale={locale} />}
      </div>
    </PageShell>
  );
}

// =============================================================================
// Guide / Glossary pages
// =============================================================================
type Guide = { id: number; slug: string; title: any; summary: any; updatedAt: string | null };
type Term  = { id: number; term: string; termSet: string | null; display: any; definition: any };

function pickEn(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  return v.en || Object.values(v)[0] || "";
}

export function GuideIndex() {
  const { data, isLoading } = useQuery<{ guides: Guide[] }>({ queryKey: ["/api/bmv-vin/guides"] });
  return (
    <PageShell>
      <Helmet><title>Guide library — bmv.vin</title></Helmet>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px" }}>
        <Crumb items={[{ label: "Decoder", href: "/" }, { label: "Guides" }]} />
        <h1 style={{ fontFamily: F.sans, fontWeight: 700, fontSize: "clamp(28px, 4vw, 40px)", letterSpacing: "-0.025em", lineHeight: 1.0, color: C.ink, margin: "0 0 32px" }}>Guide library.</h1>
        {isLoading && <Loader2 style={{ width: 20, height: 20, color: C.blue }} className="animate-spin" />}
        <div style={{ display: "grid", gap: 10 }}>
          {(data?.guides ?? []).map(g => (
            <Link key={g.id} href={`/guide/${g.slug}`} data-testid={`link-guide-${g.slug}`} style={{ textDecoration: "none" }}>
              <div style={{ background: C.white, border: `1px solid ${C.rule}`, borderRadius: 10, padding: "20px 22px", transition: "border-color 0.12s" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = C.ruleMid}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = C.rule}
              >
                <div style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em", color: C.ink, marginBottom: 4 }}>{pickEn(g.title)}</div>
                <div style={{ fontFamily: F.sans, fontWeight: 300, fontSize: 13.5, lineHeight: 1.65, color: C.ink4 }}>{pickEn(g.summary)}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </PageShell>
  );
}

export function GuideDetail() {
  const [, params] = useRoute("/guide/:slug");
  const slug = params?.slug ?? "";
  const { data } = useQuery<{ guide: Guide | null }>({ queryKey: ["/api/bmv-vin/guides", slug], enabled: !!slug });
  return (
    <PageShell>
      <Helmet><title>{pickEn(data?.guide?.title) || "Guide"} — bmv.vin</title></Helmet>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px" }}>
        <Crumb items={[{ label: "Decoder", href: "/" }, { label: "Guides", href: "/guide" }, { label: pickEn(data?.guide?.title) || slug }]} />
        <h1 style={{ fontFamily: F.sans, fontWeight: 700, fontSize: "clamp(24px, 3.5vw, 36px)", letterSpacing: "-0.02em", lineHeight: 1.1, color: C.ink, margin: "0 0 24px" }}>{pickEn(data?.guide?.title) || slug}.</h1>
        <p style={{ fontFamily: F.sans, fontWeight: 300, fontSize: 15, lineHeight: 1.7, color: C.ink4 }}>See the full guide content below.</p>
      </div>
    </PageShell>
  );
}

export function GlossaryIndex() {
  const { data, isLoading } = useQuery<{ terms: Term[] }>({ queryKey: ["/api/bmv-vin/glossary"] });
  const grouped = (data?.terms ?? []).reduce<Record<string, Term[]>>((acc, t) => { (acc[t.termSet || "other"] ||= []).push(t); return acc; }, {});
  return (
    <PageShell>
      <Helmet><title>Glossary — bmv.vin</title></Helmet>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px" }}>
        <Crumb items={[{ label: "Decoder", href: "/" }, { label: "Glossary" }]} />
        <h1 style={{ fontFamily: F.sans, fontWeight: 700, fontSize: "clamp(28px, 4vw, 40px)", letterSpacing: "-0.025em", lineHeight: 1.0, color: C.ink, margin: "0 0 32px" }}>Glossary.</h1>
        {isLoading && <Loader2 style={{ width: 20, height: 20, color: C.blue }} className="animate-spin" />}
        {Object.entries(grouped).map(([set, terms]) => (
          <section key={set} style={{ marginBottom: 32 }}>
            <h2 style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em", color: C.ink, margin: "0 0 12px" }}>{set}</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {terms.map(t => (
                <Link key={t.id} href={`/glossary/${t.term}`} data-testid={`link-term-${t.term}`} style={{ textDecoration: "none" }}>
                  <span style={{ display: "inline-block", padding: "6px 12px", border: `1px solid ${C.rule}`, borderRadius: 6, fontFamily: F.sans, fontWeight: 400, fontSize: 13.5, color: C.ink3, background: C.white, cursor: "pointer", transition: "border-color 0.12s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.blue; (e.currentTarget as HTMLElement).style.background = C.blueTint; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.rule; (e.currentTarget as HTMLElement).style.background = C.white; }}
                  >{pickEn(t.display) || t.term}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageShell>
  );
}

export function GlossaryTerm() {
  const [, params] = useRoute("/glossary/:term");
  const term = params?.term ?? "";
  const { data } = useQuery<{ term: Term | null }>({ queryKey: ["/api/bmv-vin/glossary", term], enabled: !!term });
  return (
    <PageShell>
      <Helmet><title>{pickEn(data?.term?.display) || term} — bmv.vin glossary</title></Helmet>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px" }}>
        <Crumb items={[{ label: "Decoder", href: "/" }, { label: "Glossary", href: "/glossary" }, { label: pickEn(data?.term?.display) || term }]} />
        <h1 style={{ fontFamily: F.sans, fontWeight: 700, fontSize: "clamp(24px, 3.5vw, 36px)", letterSpacing: "-0.02em", lineHeight: 1.1, color: C.ink, margin: "0 0 24px" }}>{pickEn(data?.term?.display) || term}.</h1>
        <p style={{ fontFamily: F.sans, fontWeight: 300, fontSize: 15, lineHeight: 1.7, color: C.ink4 }}>See the definition below.</p>
      </div>
    </PageShell>
  );
}

// =============================================================================
// SEO growth pages — thin hydration shells
// =============================================================================
function SeoShell({ title, subtitle, testId }: { title: string; subtitle?: string; testId?: string }) {
  const [vinInput, setVinInput] = useState("");
  const [, navigate] = useLocation();
  return (
    <PageShell>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "72px 48px 64px" }}>
        <h1 style={{ fontFamily: F.sans, fontWeight: 700, fontSize: "clamp(24px, 3.5vw, 40px)", letterSpacing: "-0.025em", lineHeight: 1.0, color: C.ink, margin: "0 0 12px" }} data-testid={testId}>{title}.</h1>
        {subtitle && <p style={{ fontFamily: F.sans, fontWeight: 300, fontSize: 15, lineHeight: 1.7, color: C.ink4, margin: "0 0 40px" }}>{subtitle}</p>}
        <CellInstrument value={vinInput} onChange={setVinInput} onDecode={() => { const c = vinInput.replace(/[^A-HJ-NPR-Z0-9]/gi,"").toUpperCase(); if (c.length===17) navigate(`/${c}`); }} isDecoding={false} />
      </div>
    </PageShell>
  );
}

export function VinToolPage() {
  const [currentPath] = useLocation();
  const slug = currentPath.replace(/^\//, "");
  const title = slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return (<><Helmet><title>{title} — bmv.vin</title><link rel="canonical" href={`https://bmv.vin/${slug}`} /></Helmet><SeoShell title={title} subtitle="Free BMW lookup tool. Enter any 17-character VIN to get instant results." testId={`page-vin-tool-${slug}`} /></>);
}

export function ModelVinPage() {
  const [currentPath] = useLocation();
  const vm = currentPath.match(/^\/bmw-([a-z0-9]+)-vin-decoder$/);
  const mm = !vm ? currentPath.match(/^\/bmw-([a-z0-9-]+)$/) : null;
  const chassis = vm ? vm[1].toUpperCase() : "";
  const modelSlug = mm ? mm[1] : "";
  const modelName = modelSlug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  if (vm) return (<><Helmet><title>BMW {chassis} VIN Decoder — bmv.vin</title><link rel="canonical" href={`https://bmv.vin/bmw-${chassis.toLowerCase()}-vin-decoder`} /></Helmet><SeoShell title={`BMW ${chassis} VIN Decoder`} subtitle={`Decode any BMW ${chassis} VIN. Get build sheet, options, paint code, and production date.`} testId={`page-model-vin-${chassis.toLowerCase()}`} /></>);
  return (<><Helmet><title>{modelName ? `BMW ${modelName} VIN Lookup` : "BMW VIN Lookup"} — bmv.vin</title>{modelSlug && <link rel="canonical" href={`https://bmv.vin/bmw-${modelSlug}`} />}</Helmet><SeoShell title={modelName ? `BMW ${modelName} VIN Lookup` : "BMW VIN Lookup"} subtitle={modelName ? `Decode any BMW ${modelName} VIN. Get build sheet, options, paint code, and production date.` : "Free BMW lookup tool. Enter any 17-character VIN."} testId={`page-model-landing-${modelSlug || "unknown"}`} /></>);
}

export function ComparePage() {
  const [, params] = useRoute("/compare/:slug");
  const slug = params?.slug ?? "";
  const title = slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return (<><Helmet><title>{title} — bmv.vin</title><link rel="canonical" href={`https://bmv.vin/compare/${slug}`} /></Helmet><SeoShell title={title} testId={`page-compare-${slug}`} /></>);
}

export function DataPage() {
  const [, params] = useRoute("/data/:slug");
  const slug = params?.slug ?? "";
  const title = slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return (<><Helmet><title>{title} — BMW VIN Data | bmv.vin</title><link rel="canonical" href={`https://bmv.vin/data/${slug}`} /></Helmet><SeoShell title={title} testId={`page-data-${slug}`} /></>);
}
