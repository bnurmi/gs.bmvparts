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
        <a href="#how-it-works" style={{
          fontFamily: F.sans, fontWeight: 500, fontSize: 13.5,
          color: C.ink4, textDecoration: "none",
        }}
          onMouseEnter={e => (e.target as HTMLElement).style.color = C.ink}
          onMouseLeave={e => (e.target as HTMLElement).style.color = C.ink4}
        >How it works</a>
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
  manufacturer: string | null; division?: string | null;
  chassis: string | null; series: string | null;
  generation?: string | null; bodyType?: string | null;
  modelName?: string | null; modelYear: number | null;
  plant: { code: string; city: string; country: string } | null;
  engine?: string | null; engineFamily?: string | null;
  driveType?: string | null;
  isValid: boolean; validationErrors: string[];
  productionSequence: string | null; last7?: string | null;
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

function DataCard({ label, value, sub, code, primary }: { label: string; value: string; sub?: string; code?: string; primary?: boolean }) {
  return (
    <div style={{
      background: primary ? C.blue : C.surface,
      border: `1px solid ${primary ? "transparent" : C.rule}`,
      borderRadius: 10, padding: "20px 22px",
    }}>
      <div style={{ fontFamily: F.sans, fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.10em", color: primary ? "rgba(255,255,255,0.65)" : C.ink5, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontFamily: F.sans, fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.15, color: primary ? C.white : C.ink }}>
          {value || "—"}
        </div>
        {code && (
          <span style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 700,
            color: primary ? "rgba(255,255,255,0.60)" : C.ink4,
            letterSpacing: "0.04em",
          }}>
            {code}
          </span>
        )}
      </div>
      {sub && (
        <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 300, color: primary ? "rgba(255,255,255,0.55)" : C.ink3, marginTop: 4 }}>
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
// bmv.vin Decoder Results — fully branded, self-contained
// =============================================================================

interface DecodeResponse {
  decoded: DecodedVin & { isBmw: boolean };
  matchedCars: { id: number; chassis: string; modelName: string; slug: string; totalParts: number }[];
  decodeStatus?: string;
}

interface BwVehicle {
  vin: string; codeType: string | null; chassis: string | null;
  market: string | null; engine: string | null; drivetrain: string | null;
  transmission: string | null; color: string | null; colorCode: string | null;
  upholstery: string | null; upholsteryCode: string | null;
  startOfProduction: string | null; manufacturer: string | null; modelName: string | null;
}

interface BwOption { code: string; nameEn: string; nameDe: string; imageUrl: string | null; }
interface BwImages { exteriorUrl: string | null; interiorUrl: string | null; exterior360Urls: string[]; }
interface BwManual { number: string; language: string; date: string; downloadUrl: string; }
interface BwData { vehicle: BwVehicle | null; options: BwOption[]; images: BwImages | null; manuals: BwManual[]; }
interface BwResponse { found: boolean; data?: BwData; coverage?: { missing?: string[] } | null; }

// Kicker label — small uppercase eyebrow
function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: F.sans, fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: C.ink5, marginBottom: 8 }}>
      {children}
    </div>
  );
}

// Section heading inside results
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em", color: C.ink, margin: "0 0 14px" }}>
      {children}
    </h2>
  );
}

// Info row: label + value pair
function InfoRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontFamily: F.sans, fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.10em", color: C.ink5 }}>{label}</div>
      <div style={{ fontFamily: mono ? F.mono : F.sans, fontSize: 15, fontWeight: mono ? 700 : 500, color: C.ink }}>{value}</div>
    </div>
  );
}

// Tab button
function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} type="button" style={{
      fontFamily: F.sans, fontSize: 13.5, fontWeight: active ? 600 : 400,
      color: active ? C.blue : C.ink4,
      background: "none", border: "none", padding: "10px 0",
      borderBottom: `2px solid ${active ? C.blue : "transparent"}`,
      cursor: "pointer", transition: "color 0.12s, border-color 0.12s",
      whiteSpace: "nowrap",
    }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = C.ink; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = C.ink4; }}
    >{label}</button>
  );
}

type TabId = "vehicle" | "options" | "images" | "manuals";

// =============================================================================
// Helpers: colour normalisation + country flag
// =============================================================================

// =============================================================================
// BMW engine code → human description lookup
// Covers families seen in our DB. Code is the primary identifier; this provides
// the human-readable description shown as the sub-label when bwv.engine is null.
// =============================================================================
const BMW_ENGINE_CODES: Record<string, string> = {
  // ── B-series modular (current gen) ──────────────────────────────────────────
  // B38 — 3-cyl 1.5L petrol
  "B38": "1.5L 3-cyl Turbo Petrol", "B38A15M2": "1.5L 3-cyl Turbo Petrol",
  "B38C": "1.5L 3-cyl Turbo Petrol",
  // B46 — 4-cyl 1.5L diesel (rare)
  "B46": "1.5L 4-cyl Turbo Diesel", "B46A20O2": "2.0L 4-cyl Turbo Diesel",
  "B46B20O1": "2.0L 4-cyl Turbo Diesel", "B46D": "2.0L 4-cyl Turbo Diesel",
  // B47 — 4-cyl 2.0L diesel
  "B47": "2.0L 4-cyl Turbo Diesel", "B47B": "2.0L 4-cyl Turbo Diesel",
  "B47C20O2": "2.0L 4-cyl Turbo Diesel", "B47C20U2": "2.0L 4-cyl Turbo Diesel",
  "B47D": "2.0L 4-cyl Turbo Diesel", "B47D20O0": "2.0L 4-cyl Turbo Diesel",
  "B47D20O1": "2.0L 4-cyl Turbo Diesel", "B47D20O2": "2.0L 4-cyl Turbo Diesel",
  "B47D20U1": "2.0L 4-cyl Turbo Diesel", "B47F": "2.0L 4-cyl Turbo Diesel",
  "N47": "2.0L 4-cyl Turbo Diesel", "N47N": "2.0L 4-cyl Turbo Diesel",
  "N47S": "2.0L 4-cyl Turbo Diesel", "N47S1": "2.0L 4-cyl Turbo Diesel",
  // B48 — 4-cyl 2.0L petrol
  "B48": "2.0L 4-cyl Turbo Petrol", "B48A20M1": "2.0L 4-cyl Turbo Petrol",
  "B48A20M2": "2.0L 4-cyl Turbo Petrol", "B48A20O2": "2.0L 4-cyl Turbo Petrol",
  "B48A20T2": "2.0L 4-cyl Turbo Petrol", "B48B16M0": "1.6L 4-cyl Turbo Petrol",
  "B48B16M2": "1.6L 4-cyl Turbo Petrol", "B48B20M0": "2.0L 4-cyl Turbo Petrol",
  "B48B20M1": "2.0L 4-cyl Turbo Petrol", "B48B20M2": "2.0L 4-cyl Turbo Petrol",
  "B48B20O1": "2.0L 4-cyl Turbo Petrol", "B48B20O2": "2.0L 4-cyl Turbo Petrol",
  "B48C": "2.0L 4-cyl Turbo Petrol", "B48D": "2.0L 4-cyl Turbo Petrol",
  "B48E": "2.0L 4-cyl Turbo Petrol",
  "N20": "2.0L 4-cyl Turbo Petrol", "N13": "1.6L 4-cyl Turbo Petrol",
  "N43": "2.0L 4-cyl Petrol", "N46": "2.0L 4-cyl Petrol", "N46N": "2.0L 4-cyl Petrol",
  "N52": "3.0L I6 Petrol", "N52N": "3.0L I6 Petrol",
  // B57 — 6-cyl 3.0L diesel
  "B57": "3.0L I6 Turbo Diesel", "B57D30O0": "3.0L I6 Turbo Diesel",
  "B57D30O2": "3.0L I6 Turbo Diesel", "B57D30O3": "3.0L I6 Tri-Turbo Diesel",
  "B57D30S0": "3.0L I6 Turbo Diesel", "B57D30T0": "3.0L I6 Twin-Turbo Diesel",
  "B57D30T2": "3.0L I6 Twin-Turbo Diesel", "B57D30T3": "3.0L I6 Tri-Turbo Diesel",
  "N57": "3.0L I6 Turbo Diesel", "N57N": "3.0L I6 Turbo Diesel",
  "N57S": "3.0L I6 Twin-Turbo Diesel", "N57Z": "3.0L I6 Quad-Turbo Diesel",
  "M47N": "2.0L 4-cyl Turbo Diesel", "M57N2": "3.0L I6 Twin-Turbo Diesel",
  // B58 — 6-cyl 3.0L petrol (current)
  "B58": "3.0L I6 Twin-Turbo Petrol", "B58B30M0": "3.0L I6 Twin-Turbo Petrol",
  "B58B30M1": "3.0L I6 Twin-Turbo Petrol", "B58B30M2": "3.0L I6 Twin-Turbo Petrol",
  "B58B30O1": "3.0L I6 Twin-Turbo Petrol", "B58B30U2": "3.0L I6 Twin-Turbo Petrol",
  "B58C": "3.0L I6 Twin-Turbo Petrol",
  "N54": "3.0L I6 Twin-Turbo Petrol", "N55": "3.0L I6 Twin-Turbo Petrol",
  // ── M-division engines ──────────────────────────────────────────────────────
  "S55": "3.0L I6 Twin-Turbo Petrol (M)",   // F80 M3 / F82 M4
  "S58": "3.0L I6 Twin-Turbo Petrol (M)",   // G80 M3 / G82 M4
  "S58B30O0": "3.0L I6 Twin-Turbo Petrol (M)",
  "S58B30T0": "3.0L I6 Twin-Turbo Petrol (M)",
  "S52": "3.2L I6 Petrol (M)",              // E36 M3
  "S62": "5.0L V8 Petrol (M)",              // E39 M5
  "S65": "4.0L V8 Petrol (M)",              // E90 M3
  "S85": "5.0L V10 Petrol (M)",             // E60 M5
  "S63R": "4.4L V8 Twin-Turbo Petrol (M)",  // F10 M5 / F12 M6
  "N63": "4.4L V8 Twin-Turbo Petrol",       // non-M
  "N63B44T3": "4.4L V8 Twin-Turbo Petrol",
  "S68B44T0": "4.4L V8 Twin-Turbo Petrol (M)", // G60 M5
  "M42": "1.8L I4 Petrol", "M43": "1.8L I4 Petrol",
  "M50": "2.5L I6 Petrol", "M52": "2.8L I6 Petrol", "M54": "3.0L I6 Petrol",
  "M62": "4.4L V8 Petrol", "M73": "5.4L V12 Petrol",
  "N62": "4.4L V8 Petrol", "N62N": "4.4L V8 Petrol",
  // ── Electric / hybrid ───────────────────────────────────────────────────────
  "HA0001N0": "Electric Motor (eAWD)", "HA0001N1": "Electric Motor (eAWD)",
  "HA0004N0": "Electric Motor", "HB0003N0": "Electric Motor",
  "HB0003N1": "Electric Motor",
  "XB1114M1": "Electric Motor", "XB1141M1": "Electric Motor",
  "XB1141M2": "Electric Motor", "XB1151M1": "Electric Motor",
  "XB1151U2": "Electric Motor", "XB1161T0": "Electric Motor",
  "XB2231O0": "Electric Motor", "XD5141O0": "Electric Motor",
  "XE2A01N0": "Electric Motor (Rear)", "XE2A01N1": "Electric Motor (Rear)",
  "XE2A02N0": "Electric Motor (Front)", "XE2A03N0": "Electric Motor",
  "XE2B01N0": "Electric Motor", "XE2B01N1": "Electric Motor",
  "XE2D11N0": "Electric Motor",
};

/** Look up a human description for a BMW engine code. Returns null if unknown. */
function describeEngine(code: string | null | undefined): string | null {
  if (!code) return null;
  return BMW_ENGINE_CODES[code] ?? BMW_ENGINE_CODES[code.replace(/[A-Z]\d+$/, "")] ?? null;
}

// Helpers: colour/upholstery/drivetrain normalisation + country flag
// =============================================================================

/** Country name → flag emoji. Covers all BMW plant countries. */
const COUNTRY_FLAGS: Record<string, string> = {
  "Germany":      "🇩🇪",
  "South Africa": "🇿🇦",
  "USA":          "🇺🇸",
  "Austria":      "🇦🇹",
  "Netherlands":  "🇳🇱",
  "China":        "🇨🇳",
  "UK":           "🇬🇧",
  "Mexico":       "🇲🇽",
  "Brazil":       "🇧🇷",
  "India":        "🇮🇳",
  "Thailand":     "🇹🇭",
  "Egypt":        "🇪🇬",
  "Malaysia":     "🇲🇾",
};

function countryFlag(country: string | null | undefined): string {
  if (!country) return "";
  return COUNTRY_FLAGS[country] ?? "";
}

/** BMW paint code → English name. Source: PaintRef.com + bmwvin.com (2026-06-25). */
const BMW_PAINT_CODES: Record<string, string> = {
  "001":"Arctic Silver Metallic","003":"Bronzit Beige","004":"Sahara","005":"Havana Beige Metallic",
  "006":"Agave","007":"Coral Red","008":"Scarlet Red","009":"Cardinal Red","010":"Cinnabar Red",
  "011":"Nile Green","012":"Sierra Green","013":"Silver Gray Metallic","014":"Aquamarine",
  "015":"Neptune Blue","016":"Acapulco Blue Metallic","017":"Fjord Gray Metallic",
  "018":"Steel Blue Metallic","019":"Torc Blue Metallic","020":"Navy Blue Metallic",
  "021":"Ivory","022":"Midnight Blue","023":"Forest Green","024":"Orion Silver Metallic",
  "025":"Metallic Beige","026":"Coupe Gray","027":"Buff Beige","028":"Silver Blue",
  "029":"Medium Green Metallic","030":"Cinnabar Red Metallic","031":"Fjord Gray Metallic",
  "033":"Walnut Brown Metallic","034":"Rosso Corsa Red","035":"Mauve Red",
  "036":"Coral Red Metallic","037":"Apricot Beige Metallic","038":"Beige Gray",
  "039":"Dark Anthracite Metallic","040":"Silver Green Metallic","041":"Black Sapphire Metallic",
  "042":"Dark Brown Metallic","043":"Beige","044":"Brown Sienna","045":"Dark Brown",
  "046":"Cocoa Brown Metallic","047":"Cinnamon Brown Metallic","048":"Golden Brown Metallic",
  "049":"Henna Red","050":"Reseda Green Metallic","051":"Kelp Green","052":"Light Green",
  "053":"Reseda Green Metallic","054":"Fir Green Metallic","055":"Burgundy","057":"Orange",
  "059":"Lotus White","062":"Agave Green","063":"Tundra Green","064":"Forest Green",
  "065":"Fern Green Metallic","066":"Light Yellow","067":"Signal Yellow","068":"Ivory",
  "069":"Sunflower Yellow","070":"Bahama Yellow","071":"Dakar Yellow","072":"Garnet Red",
  "073":"Dark Red Metallic","074":"Cardinal Red","075":"Polaris Silver","076":"Light Ivory",
  "077":"Champagne","078":"White","079":"Opaque White","080":"Alpine White",
  "081":"Polar Silver","082":"Titanium Silver Metallic","083":"Titan Silver Metallic",
  "084":"Glacier Silver Metallic","085":"Sterling Silver Metallic","086":"Silver Metallic",
  "087":"Black","088":"Jet Black","089":"Dark Gray","090":"Dark Gray Metallic",
  "091":"Graphite Metallic","092":"Obsidian Black Metallic","093":"Dark Gray Metallic",
  "094":"Gray","095":"Brown","096":"Tanning Red","097":"Violet","098":"Gray",
  "099":"Olive Brown Metallic","100":"Atlantic Blue Metallic","101":"Orient Blue Metallic",
  "102":"Cobalt Blue Metallic","103":"Mystic Blue Metallic","104":"Estoril Blue Metallic",
  "105":"Scamander Blue","106":"Monaco Blue Metallic","107":"Lagoon Blue",
  "108":"Topaz Blue Metallic","109":"Mauritius Blue Metallic","110":"Sea Blue Metallic",
  "111":"Light Blue","112":"Salmon Silver","114":"Ocean Blue Metallic","115":"Turquoise",
  "120":"Stratos Blue","121":"Light Blue Metallic","125":"Silver Blue Metallic",
  "126":"Steel Blue","127":"Steel Blue Metallic","128":"Interlagos Blue Metallic",
  "130":"Sky Blue Metallic","131":"Deep Sea Blue Metallic","132":"Isar Blue",
  "133":"Night Blue","134":"Santorini Blue","136":"Dove Blue","137":"Violet Blue",
  "139":"Midnight Blue Metallic","140":"Azure Blue","141":"Lazur Blue","142":"Riviera Mauve",
  "143":"Madeira Blue","144":"Bermuda Blue","145":"Denim Blue","150":"Lavender",
  "152":"Dolphin Sea Blue","156":"Brilliant Blue","157":"Ultra Marine Blue",
  "175":"Cosmos Black","176":"Night Black Metallic","177":"Smoke White",
  "178":"Havana Beige Metallic","179":"Caramel Beige Metallic","180":"Pastel Yellow",
  "181":"Pastel Blue","183":"Pastel Pink","184":"Pearl","300":"Arctic White",
  "301":"Opal White","303":"Cosmos Black Metallic","430":"Le Mans Blue","431":"Imola Red",
  "475":"Carbon Black Metallic","668":"Velvet Blue Metallic",
  "A06":"Tansanit Blue Metallic","A09":"Laguna Seca Blue","A17":"Silver Gray Metallic",
  "A22":"Midnight Blue Metallic","A35":"Mauve Red Metallic","A45":"Silver Metallic",
  "A52":"Light Green","A55":"Burgundy","A62":"Agave Green","A72":"Garnet Red",
  "A75":"Polaris Silver","A82":"Titanium Silver Metallic","A83":"Titanium Silver Metallic",
  "A90":"Lime Rock Grey Metallic","A96":"Tanning Red",
  "B07":"San Marino Blue Metallic","B08":"Tanzanite Blue Metallic","B14":"Orient Blue",
  "B39":"Mineral Grey Metallic","B45":"Frozen Blue Metallic","B46":"Sepang Bronze",
  "B47":"Frozen Bronze Metallic","B48":"Sakhir Orange Metallic","B56":"Midnight Blue Metallic",
  "B60":"Java Green Metallic","B61":"Limerock Grey Metallic","B62":"Frozen Brilliant White",
  "B63":"Frozen Dark Silver Metallic","B64":"Frozen Dark Brown Metallic",
  "B65":"Frozen Cashmere Silver Metallic","B67":"Frozen Black Metallic",
  "B69":"Liquid Copper Metallic","B72":"Sunset Orange Metallic","B74":"Frozen Red Metallic",
  "B75":"Moonstone Metallic","B76":"Amethyst Metallic","B77":"Azur Metallic",
  "B78":"Moonlight Silver Metallic","B79":"Sophisto Grey Metallic",
  "B80":"Champagne Quartz Metallic","B81":"Phytonic Blue Metallic",
  "B82":"Skyscraper Grey Metallic","B83":"Twilight Purple Metallic",
  "B84":"Piemont Red Metallic","B85":"Portimao Blue Metallic","B86":"Thundernight Metallic",
  "B87":"Atacama Yellow","B88":"Frozen Bluestone Metallic","B89":"Kith Blue",
  "B90":"Frozen Arctic Grey Metallic","B91":"Emerald Grey Metallic",
  "B92":"Tasman Green Metallic","B93":"Papyrus White",
  "C01":"Sparkling Graphite Metallic","C02":"Oxford Green Metallic",
  "C04":"Ferric Grey Metallic","C05":"Bluestone Metallic","C27":"Arktis Grey Brilliant Effect",
  "C35":"Blue Ridge Mountain Metallic","C36":"Grigio Telesto",
  "D01":"Mineral White Metallic","D02":"Marina Bay Blue Metallic","D03":"Java Green Metallic",
  "D04":"Snapper Rocks Blue Metallic","D05":"Smoked White","D06":"Mocha Metallic",
  "D07":"Sophisto Grey Metallic","D08":"Sakhir Orange Metallic","D09":"Orion Silver Metallic",
  "D10":"Brilliant White","D15":"Sunset Orange Metallic","D16":"Cape York Green Metallic",
  "D17":"Sophisto Grey Brilliant Effect","D18":"Storm Bay Metallic",
  "D19":"Thundernight Metallic","D20":"Galvanic Gold Metallic","D21":"Brooklyn Grey Metallic",
  "D22":"Dravit Grey Metallic","D23":"Frozen Black Metallic","D24":"Skyscraper Grey Metallic",
  "D25":"Tourmaline Violet Metallic","D26":"Aventurin Red Metallic",
  "D28":"Frozen Dark Silver Metallic","D29":"Frozen Cashmere Silver Metallic",
  "D30":"Mineral Grey Metallic","D31":"Frozen Brilliant White","D33":"Flamenco Red",
  "D34":"Speed Yellow","D36":"Long Beach Blue Metallic","D37":"Imola Red II",
  "D38":"Melbourne Red Metallic","D39":"Vermilion Red","D40":"Twilight Purple Metallic",
  "D43":"Isle of Man Green Metallic","D44":"Hockenheim Silver Metallic",
  "D45":"Voodoo Blue Metallic","D46":"Sao Paulo Yellow","D48":"Yas Marina Blue Metallic",
  "D49":"Interlagos Blue Metallic","D50":"Daytona Violet Metallic",
  "D53":"Nardo Grey Metallic","D54":"Grigio Medio Metallic","D62":"Kyalami Orange Metallic",
  "D64":"Copper Grey Metallic","D67":"Velocity Blue","D70":"Phytonic Blue Metallic",
  "D71":"M Portimao Blue","D72":"M Zandvoort Blue","D73":"Piemont Red Metallic",
  "D74":"Dune Grey Metallic","D76":"Manhattan Brown Metallic","D77":"Thundernight Metallic",
  "D78":"Atlantic Blue Metallic","D79":"Portimao Blue Metallic","D85":"Frozen Grey Metallic",
  "D86":"Cedros Green Metallic","D87":"Manhattan Green Metallic",
  "D88":"Corundum Grey Metallic","D90":"Petrol Mica","D91":"Viola Metallic",
  "D92":"Verona Red","D93":"Sparkling Copper Metallic",
  "E01":"Black Sapphire Metallic","E04":"Space Grey Metallic","E07":"Monte Carlo Blue Metallic",
  "U91":"Azurite Black Metallic","W82":"Alpine White","W83":"BMW M White",
  "W86":"Mineral White Metallic",
};

/** Known German → English colour word translations */
const DE_EN: Record<string, string> = {
  "schwarz":"Black","weiss":"White","weiß":"White","silber":"Silver","silbern":"Silver",
  "grau":"Grey","blau":"Blue","rot":"Red","grün":"Green","gelb":"Yellow",
  "orange":"Orange","braun":"Brown","beige":"Beige","violett":"Violet",
  "turmalin":"Tourmaline","saphir":"Sapphire","titan":"Titanium","oxid":"Oxide",
  "karbon":"Carbon","mineral":"Mineral","bernstein":"Amber","brillant":"Brilliant",
  "frozen":"Frozen","individual":"Individual",
};

/**
 * Normalise a BMW colour string. Code lookup first, then title-case + DE→EN translation.
 * Returns { display, sub } where sub shows original raw name when meaningfully different.
 */
function normaliseColour(raw: string | null | undefined, code?: string | null): { display: string; sub: string | null } {
  if (!raw) return { display: "", sub: null };

  // 1. Code lookup — if we have an authoritative English name, prefer it
  if (code) {
    const canonical = BMW_PAINT_CODES[code.toUpperCase()];
    if (canonical) {
      // Show raw underneath only if it carries extra info (e.g. different name)
      const rawClean = raw.replace(/\s*\([A-Z0-9]{2,4}\)\s*$/, "").trim();
      const sub = rawClean.toLowerCase() !== canonical.toLowerCase() ? rawClean : null;
      return { display: canonical, sub };
    }
  }

  // 2. Strip parenthetical code suffix
  const stripped = raw.replace(/\s*\([A-Z0-9]{2,4}\)\s*$/, "").trim();

  // 3. Title-case with DE→EN word substitution
  const titleCase = (s: string) =>
    s.replace(/[-\s]+/g, " ").split(" ").map(w => {
      if (/^[IVX]+$/i.test(w) && w.length <= 4) return w.toUpperCase(); // Roman numerals
      const lw = w.toLowerCase();
      if (DE_EN[lw]) return DE_EN[lw];
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(" ");

  const display = titleCase(stripped);

  const hasGerman = Object.keys(DE_EN).some(k => raw.toLowerCase().includes(k));
  const wasAllCaps = raw === raw.toUpperCase() && raw.length > 3;
  const hadCode = /\([A-Z0-9]{2,4}\)/.test(raw);
  const sub = (hasGerman || wasAllCaps || hadCode) && raw.trim() !== display
    ? stripped : null;

  return { display, sub };
}

/** Normalise BMW upholstery string — same approach as colour. */
const DE_EN_UPHOLSTERY: Record<string, string> = {
  "leder":"Leather","stoff":"Fabric","alcantara":"Alcantara","merino":"Merino",
  "vernasca":"Vernasca","sensatec":"Sensatec","dakota":"Dakota","nevada":"Nevada",
  "nappa":"Nappa","schwarz":"Black","weiss":"White","weiß":"White","grau":"Grey",
  "beige":"Beige","braun":"Brown","rot":"Red","blau":"Blue","anthrazit":"Anthracite",
  "elfenbein":"Ivory","cognac":"Cognac","mokka":"Mocha","sonnengelb":"Sun Yellow",
  "kyalami":"Kyalami","fjord":"Fjord","parchment":"Parchment","smoke":"Smoke",
};

function normaliseUpholstery(raw: string | null | undefined): { display: string; sub: string | null } {
  if (!raw) return { display: "", sub: null };
  const stripped = raw.replace(/\s*\([A-Z0-9]{2,4}\)\s*$/, "").trim();

  // BMW-specific proper nouns that must survive translation unchanged
  const BMW_PROPER_NOUNS = new Set(["midrand", "kyalami", "fjord", "parchment", "smoke", "sonnengelb", "nevada", "dakota", "nappa", "vernasca", "sensatec", "merino", "alcantara", "vernasca"]);

  // Translate a single word
  const translateWord = (w: string): string => {
    const lw = w.toLowerCase();
    if (DE_EN_UPHOLSTERY[lw]) return DE_EN_UPHOLSTERY[lw];
    // BMW proper nouns: title-case but don't translate
    if (BMW_PROPER_NOUNS.has(lw)) return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  };

  // Translate a segment (space/hyphen-delimited words within one slash segment)
  const translateSegment = (seg: string): string =>
    seg.replace(/[-\s]+/g, " ").trim().split(" ").map(translateWord).join(" ");

  // Split on "/" to handle compound upholstery like "Stoff Ribbon/anthrazit" or "Leder/Alcantara schwarz/midrand-beige"
  const display = stripped.split("/").map(translateSegment).join(" / ");

  const hasGerman = Object.keys(DE_EN_UPHOLSTERY).some(k => raw.toLowerCase().includes(k));
  const wasAllCaps = raw === raw.toUpperCase() && raw.length > 3;
  const sub = (hasGerman || wasAllCaps) && raw.trim() !== display ? stripped : null;
  return { display, sub };
}

/** Normalise BMW drivetrain — returns { display, sub } like colour/upholstery.
 *  display: BMW marketing name (xDrive / sDrive / eAWD / eDrive) when model confirms it, else English
 *  sub: BMW German spec term (Allradantrieb, Hinterradantrieb, Vorderradantrieb)
 *  modelName: optional — used to detect drive system branding from model name
 */
function normaliseDrivetrain(
  raw: string | null | undefined,
  modelName?: string | null
): { display: string; sub: string | null } {
  if (!raw) return { display: "", sub: null };

  const key = raw.toLowerCase().trim();
  const model = (modelName ?? "").toLowerCase();

  // BMW German sub-labels
  const germanSub: Record<string, string> = {
    "awd": "Allradantrieb", "all-wheel drive": "Allradantrieb",
    "all wheel-drive": "Allradantrieb", "all wheel drive": "Allradantrieb",
    "allr": "Allradantrieb", "allrad": "Allradantrieb",
    "xdrive": "Allradantrieb", "eawd": "Allradantrieb",
    "rwd": "Hinterradantrieb", "rear-wheel drive": "Hinterradantrieb",
    "rear wheel drive": "Hinterradantrieb", "rear wheel-drive": "Hinterradantrieb",
    "ha": "Hinterradantrieb", "hr": "Hinterradantrieb", "hinterrad": "Hinterradantrieb",
    "sdrive": "Hinterradantrieb", "edrive": "Hinterradantrieb",
    "fwd": "Vorderradantrieb", "front-wheel drive": "Vorderradantrieb",
    "front wheel drive": "Vorderradantrieb", "front wheel-drive": "Vorderradantrieb",
    "va": "Vorderradantrieb", "vorderrad": "Vorderradantrieb",
    "4wd": "Allradantrieb",
  };

  // eAWD: BMW M-Performance electric models with dual-motor AWD.
  // BMW labels these M50/M60/M70 on i-series — distinct from xDrive on ICE/PHEV.
  // e.g. i4 M50, i5 M60, i7 M70, iX M60. Regular iX xDrive40 uses xDrive branding.
  const isEAWD = /\b(m50|m60|m70)\b/.test(model) &&
    /\b(i4|i5|i7|ix)\b/.test(model) &&
    (key.includes("all") || key === "awd");

  // xDrive: model name contains "xdrive" — both ICE and electric variants BMW explicitly brands this way
  const isXDrive = !isEAWD && model.includes("xdrive");

  // sDrive: model name contains "sdrive" — BMW's RWD branding on X-models
  const isSDrive = model.includes("sdrive");

  // eDrive: single-motor electric RWD (i4 eDrive35, i5 eDrive40, etc.)
  const isEDrive = model.includes("edrive") && !isEAWD;

  let display: string;

  if (isEAWD || key === "eawd") {
    display = "eAWD — All-wheel drive";
  } else if (isXDrive || key === "xdrive") {
    display = "xDrive — All-wheel drive";
  } else if (isEDrive || key === "edrive") {
    display = "eDrive — Rear-wheel drive";
  } else if (isSDrive || key === "sdrive") {
    display = "sDrive — Rear-wheel drive";
  } else {
    const englishMap: Record<string, string> = {
      "rwd": "Rear-wheel drive", "fwd": "Front-wheel drive", "awd": "All-wheel drive",
      "4wd": "All-wheel drive",
      "allr": "All-wheel drive", "ha": "Rear-wheel drive", "hr": "Rear-wheel drive",
      "va": "Front-wheel drive", "allrad": "All-wheel drive",
      "hinterrad": "Rear-wheel drive", "vorderrad": "Front-wheel drive",
      "all wheel-drive": "All-wheel drive", "all wheel drive": "All-wheel drive",
      "rear-wheel drive": "Rear-wheel drive", "rear wheel drive": "Rear-wheel drive",
      "rear wheel-drive": "Rear-wheel drive",
      "front-wheel drive": "Front-wheel drive", "front wheel drive": "Front-wheel drive",
      "front wheel-drive": "Front-wheel drive",
      "right-hand drive": "Right-hand drive", "rhd": "Right-hand drive",
      "left-hand drive": "Left-hand drive", "lhd": "Left-hand drive",
    };
    display = englishMap[key] ?? (raw.charAt(0).toUpperCase() + raw.slice(1));
  }

  // German sub: use the key if mapped, else derive from the resolved display
  const sub = germanSub[key]
    ?? (display.includes("All-wheel") ? "Allradantrieb"
      : display.includes("Rear-wheel") ? "Hinterradantrieb"
      : display.includes("Front-wheel") ? "Vorderradantrieb"
      : null);

  return { display, sub };
}

// FAQ accordion
function FaqAccordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div style={{ border: `1px solid ${C.rule}`, borderRadius: 10, overflow: "hidden" }}>
      {items.map((item, i) => (
        <div key={i} style={{ borderTop: i > 0 ? `1px solid ${C.rule}` : "none" }}>
          <button
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 22px", background: open === i ? C.surface : C.white,
              border: "none", cursor: "pointer", textAlign: "left",
              transition: "background 0.12s",
            }}
            onMouseEnter={e => { if (open !== i) (e.currentTarget as HTMLElement).style.background = C.surface; }}
            onMouseLeave={e => { if (open !== i) (e.currentTarget as HTMLElement).style.background = C.white; }}
          >
            <span style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: "-0.01em" }}>
              {item.q}
            </span>
            <span style={{ fontFamily: F.sans, fontSize: 16, color: C.ink4, marginLeft: 16, flexShrink: 0, transform: open === i ? "rotate(45deg)" : "none", transition: "transform 0.15s" }}>
              +
            </span>
          </button>
          {open === i && (
            <div style={{ padding: "0 22px 16px", background: C.surface }}>
              <p style={{ fontFamily: F.sans, fontSize: 13.5, fontWeight: 300, lineHeight: 1.65, color: C.ink3, margin: 0 }}>
                {item.a}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function BmvVinDecoder({ vin }: { vin: string }) {
  const [result, setResult] = useState<DecodeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputVin, setInputVin] = useState(vin);
  const [secondVin, setSecondVin] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("vehicle");
  const [, navigate] = useLocation();

  const decodeMutation = useMutation<DecodeResponse, Error, string>({
    mutationFn: async (v: string) => {
      const res = await fetch("/api/vin/decode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vin: v }) });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    onSuccess: data => { setResult(data); setError(null); },
    onError: e => setError(e.message),
  });

  useEffect(() => {
    if (vin?.length === 17) { setInputVin(vin); decodeMutation.mutate(vin); }
  }, [vin]);

  const decoded = result?.decoded;

  const bwQuery = useQuery<BwResponse>({
    queryKey: ["/api/vin/bimmerwork", decoded?.vin],
    queryFn: async () => { const r = await fetch(`/api/vin/bimmerwork/${decoded!.vin}`); return r.json(); },
    enabled: !!decoded?.vin && !!decoded?.isBmw,
    staleTime: 5 * 60_000,
  });

  const bw = bwQuery.data?.data;
  const bwv = bw?.vehicle;

  const modelYear = bwv?.startOfProduction
    ? parseInt(bwv.startOfProduction.match(/(\d{4})/)?.[1] ?? "0", 10) || decoded?.modelYear
    : decoded?.modelYear;

  // Strip nested parens from chassis (e.g. "Sports Activity Vehicle (5 Doors)" → "Sports Activity Vehicle")
  const chassisLabel = bwv?.chassis ? bwv.chassis.replace(/\s*\([^)]*\)\s*$/, "").trim() : null;
  const modelTitle = bwv?.modelName
    ? `${modelYear ? modelYear + " " : ""}${bwv.modelName}${chassisLabel ? " (" + chassisLabel + ")" : ""}`
    : decoded?.chassis
      ? `${modelYear ? modelYear + " " : ""}BMW ${decoded.chassis}`
      : "BMW VIN Decoded.";

  function handleDecode() {
    const clean = inputVin.replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase();
    if (clean.length === 17) { navigate(`/${clean}`); decodeMutation.mutate(clean); }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: C.white }}>
      <Helmet><title>{vin} — VIN Decoder | bmv.vin</title></Helmet>
      <SiteHeader />

      {/* Hero: cell instrument + clear button */}
      <section style={{ background: C.white, padding: "48px 48px 40px", borderBottom: `1px solid ${C.rule}`, display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 820 }}>
          <CellInstrument value={inputVin} onChange={setInputVin} onDecode={handleDecode} isDecoding={decodeMutation.isPending} />
          {inputVin.length > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setInputVin("")}
                style={{
                  fontFamily: F.sans, fontSize: 12, fontWeight: 500,
                  color: C.ink5, background: "none", border: "none",
                  cursor: "pointer", padding: "4px 0",
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = C.ink}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.ink5}
              >
                ✕ Clear VIN
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Results */}
      <main style={{ flex: 1 }}>

        {/* Loading */}
        {decodeMutation.isPending && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "48px", color: C.ink4 }}>
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}>
              <circle cx="18" cy="18" r="15" stroke={C.rule} strokeWidth="2.5" />
              <path d="M18 3a15 15 0 0 1 15 15" stroke={C.blue} strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <span style={{ fontFamily: F.sans, fontWeight: 500, fontSize: 15, color: C.ink4 }}>Decoding VIN</span>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {/* Error */}
        {error && !decodeMutation.isPending && (
          <div style={{ maxWidth: 900, margin: "32px auto", padding: "0 48px" }}>
            <div style={{ background: C.redTint, border: `1px solid #F5C5C7`, borderRadius: 10, padding: "16px 20px" }}>
              <div style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 14, color: C.red, marginBottom: 4 }}>Decode failed</div>
              <div style={{ fontFamily: F.sans, fontWeight: 300, fontSize: 13.5, color: C.ink3 }}>{error}</div>
            </div>
          </div>
        )}

        {decoded && !decodeMutation.isPending && (
          <>
            {/* Vehicle hero band — white */}
            <section style={{ background: C.white, padding: "40px 48px 0", borderBottom: `1px solid ${C.rule}` }}>
              <div style={{ maxWidth: 900, margin: "0 auto" }}>

                {/* Title + validity */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
                  <div>
                    <Kicker>Decoded VIN</Kicker>
                    <h1 style={{ fontFamily: F.sans, fontWeight: 700, fontSize: "clamp(22px, 3vw, 36px)", letterSpacing: "-0.025em", lineHeight: 1.05, color: C.ink, margin: "0 0 6px" }}>
                      {modelTitle}
                    </h1>
                    <div style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 400, color: C.ink5, letterSpacing: "0.06em" }}>{decoded.vin}</div>
                  </div>
                  <ValidityPill isValid={decoded.isValid} />
                </div>

                {/* Validation warnings */}
                {decoded.validationErrors.length > 0 && (
                  <div style={{ background: "#FFFBF0", border: "1px solid #F0D080", borderRadius: 8, padding: "10px 16px", marginBottom: 24 }}>
                    {decoded.validationErrors.map((e, i) => (
                      <div key={i} style={{ fontFamily: F.sans, fontWeight: 300, fontSize: 13.5, color: C.ink3 }}>{e}</div>
                    ))}
                  </div>
                )}

                {/* Data cards grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 32 }}>
                  {/* Manufacturer: decoded is always more specific (BMW M GmbH vs BMW) */}
                  <DataCard primary label="Manufacturer" value={decoded.manufacturer || bwv?.manufacturer || ""} sub={decoded.wmi} />
                  {/* Chassis: skip sub when it equals primary (e.g. bwv.chassis=F97 = decoded.chassis) */}
                  <DataCard label="Chassis" value={decoded.chassis || ""} sub={bwv?.chassis && bwv.chassis !== decoded.chassis ? bwv.chassis : (decoded.series || undefined)} />
                  <DataCard label="Model year" value={modelYear ? String(modelYear) : ""} />
                  <DataCard label="Assembly plant"
                    value={decoded.plant ? `${countryFlag(decoded.plant.country)} ${decoded.plant.city}` : (bwv?.manufacturer ? bwv.manufacturer.split("/").pop()?.trim() || "" : "")}
                    sub={decoded.plant?.country}
                  />
                  {(bwv?.engine || decoded.engine) && (() => {
                    // Prefer decoded.engineFamily (e.g. "S58 3.0L Twin-Turbo I6") over bwv.engine raw code (e.g. "S58T")
                    // Fall back to lookup table, then raw bwv string
                    const engineDesc = decoded.engineFamily || describeEngine(decoded.engine) || null;
                    // Badge: bwv.engine is the most specific variant code (S58T > S58) -- use it when it looks like a code (short, no spaces)
                    const bwvIsCode = bwv?.engine && !/\s/.test(bwv.engine) && bwv.engine.length <= 8;
                    const engineCode = bwvIsCode ? bwv!.engine : (decoded.engine || undefined);
                    // If we have no description at all, fall back to raw bwv string as primary
                    const engineValue = engineDesc || bwv?.engine || engineCode || "";
                    return <DataCard label="Engine" value={engineValue} code={engineDesc || bwvIsCode ? engineCode : undefined} />;
                  })()}
                  {bwv?.market && <DataCard label="Market" value={bwv.market} />}
                  {decoded.division && decoded.division !== "Standard" && <DataCard label="Division" value={decoded.division} />}
                  {(bwv?.drivetrain || decoded?.driveType) && (() => {
                    // For drivetrain: pass both bwv and decoded context so xDrive/eAWD can be inferred
                    // bwv.drivetrain may be a raw code (ALLR) -- decoded.driveType and decoded.chassis give extra signal
                    const rawDrive = bwv?.drivetrain || decoded?.driveType;
                    // M SAV/SAC on xDrive chassis (F95/F96/F97/F98, G05/G06 M) are always xDrive
                    const mXDriveChassis = ["F95","F96","F97","F98"].includes(decoded.chassis || "");
                    const modelForDrive = mXDriveChassis ? (bwv?.modelName || "") + " xDrive" : bwv?.modelName;
                    const { display, sub } = normaliseDrivetrain(rawDrive, modelForDrive);
                    return <DataCard label="Drivetrain" value={display} sub={sub || undefined} />;
                  })()}
                  {bwv?.color && (() => {
                    const { display, sub } = normaliseColour(bwv.color, bwv.colorCode);
                    // Code (e.g. 668) is the key identifier — show big. Translated name as sub.
                    return <DataCard label="Colour" value={bwv.colorCode || display} sub={bwv.colorCode ? display : (sub || undefined)} />;
                  })()}
                  {bwv?.upholstery && (() => {
                    const { display, sub } = normaliseUpholstery(bwv.upholstery);
                    // Code (e.g. AYAT) is the key identifier — show big. Translated name as sub.
                    return <DataCard label="Upholstery" value={bwv.upholsteryCode || display} sub={bwv.upholsteryCode ? display : (sub || undefined)} />;
                  })()}
                  {decoded.last7 && <DataCard label="Last 7 (Serial)" value={decoded.last7} />}
                  {bwv?.startOfProduction && <DataCard label="Production date" value={bwv.startOfProduction} />}
                  {decoded.productionSequence && <DataCard label="Production seq." value={decoded.productionSequence} />}
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", gap: 28, borderBottom: `1px solid ${C.rule}` }}>
                  {(["vehicle", "options", "images", "manuals"] as TabId[]).map(tab => (
                    <Tab key={tab} label={tab.charAt(0).toUpperCase() + tab.slice(1)} active={activeTab === tab} onClick={() => setActiveTab(tab)} />
                  ))}
                </div>
              </div>
            </section>

            {/* Tab content — surface bg */}
            <section style={{ background: C.surface, padding: "32px 48px 48px", borderBottom: `1px solid ${C.rule}` }}>
              <div style={{ maxWidth: 900, margin: "0 auto" }}>

                {/* Vehicle tab */}
                {activeTab === "vehicle" && (
                  <div>
                    {/* Segment breakdown */}
                    <div style={{ marginBottom: 32 }}>
                      <SectionTitle>VIN structure</SectionTitle>
                      <SegmentBreakdown decoded={decoded} />
                    </div>

                    {/* Parts catalog */}
                    {result?.matchedCars && result.matchedCars.length > 0 && (
                      <div style={{ marginBottom: 32 }}>
                        <SectionTitle>OEM parts catalog</SectionTitle>
                        <div style={{ display: "grid", gap: 8 }}>
                          {result.matchedCars.map(car => (
                            <a key={car.id} href={`https://dev-syd-01.bmv.parts/car/${car.slug}`}
                              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", border: `1px solid ${C.rule}`, borderRadius: 10, background: C.white, textDecoration: "none", transition: "border-color 0.12s, background 0.12s" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.ruleMid; (e.currentTarget as HTMLElement).style.background = "#F0F0F5"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.rule; (e.currentTarget as HTMLElement).style.background = C.white; }}
                            >
                              <div>
                                <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 600, color: C.ink }}>{car.chassis} {car.modelName}</div>
                                <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 300, color: C.ink5, marginTop: 2 }}>bmv.parts OEM catalog</div>
                              </div>
                              <div style={{ fontFamily: F.mono, fontSize: 12, color: C.blue }}>{car.totalParts.toLocaleString()} parts →</div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {bwQuery.isLoading && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.ink5, padding: "16px 0" }}>
                        <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
                        <span style={{ fontFamily: F.sans, fontSize: 13.5, fontWeight: 300 }}>Loading enrichment data</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Options tab */}
                {activeTab === "options" && (
                  <div>
                    <SectionTitle>Factory options</SectionTitle>
                    {bwQuery.isLoading ? (
                      <div style={{ color: C.ink5, fontFamily: F.sans, fontSize: 13.5, fontWeight: 300 }}>Loading options...</div>
                    ) : (bw?.options && bw.options.length > 0) ? (
                      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 10, overflow: "hidden", background: C.white }}>
                        {bw.options.map((opt, i) => (
                          <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 16, padding: "12px 22px", borderTop: i > 0 ? `1px solid ${C.rule}` : "none", transition: "background 0.1s" }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.surface}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = C.white}
                          >
                            <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, color: C.blue }}>{opt.code}</div>
                            <div style={{ fontFamily: F.sans, fontSize: 13.5, fontWeight: 300, color: C.ink3 }}>{opt.nameEn}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontFamily: F.sans, fontSize: 13.5, fontWeight: 300, color: C.ink5 }}>
                        {bwQuery.data?.coverage?.missing?.includes("options")
                          ? "Option codes not available for this VIN. Factory data may be incomplete."
                          : "No options found for this VIN."}
                      </div>
                    )}
                  </div>
                )}

                {/* Images tab */}
                {activeTab === "images" && (
                  <div>
                    <SectionTitle>Vehicle images</SectionTitle>
                    {bwQuery.isLoading ? (
                      <div style={{ color: C.ink5, fontFamily: F.sans, fontSize: 13.5, fontWeight: 300 }}>Loading images...</div>
                    ) : bw?.images?.exteriorUrl ? (
                      <div style={{ display: "grid", gap: 12 }}>
                        {bw.images.exteriorUrl && (
                          <div>
                            <Kicker>Exterior</Kicker>
                            <img src={bw.images.exteriorUrl} alt="Exterior" style={{ width: "100%", borderRadius: 10, border: `1px solid ${C.rule}` }} />
                          </div>
                        )}
                        {bw.images.interiorUrl && (
                          <div>
                            <Kicker>Interior</Kicker>
                            <img src={bw.images.interiorUrl} alt="Interior" style={{ width: "100%", borderRadius: 10, border: `1px solid ${C.rule}` }} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontFamily: F.sans, fontSize: 13.5, fontWeight: 300, color: C.ink5 }}>No images available for this VIN.</div>
                    )}
                  </div>
                )}

                {/* Manuals tab */}
                {activeTab === "manuals" && (
                  <div>
                    <SectionTitle>Owner's manuals</SectionTitle>
                    {bwQuery.isLoading ? (
                      <div style={{ color: C.ink5, fontFamily: F.sans, fontSize: 13.5, fontWeight: 300 }}>Loading manuals...</div>
                    ) : (bw?.manuals && bw.manuals.length > 0) ? (
                      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 10, overflow: "hidden", background: C.white }}>
                        {bw.manuals.map((m, i) => (
                          <a key={i} href={m.downloadUrl} target="_blank" rel="noopener noreferrer"
                            style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px", gap: 16, padding: "14px 22px", borderTop: i > 0 ? `1px solid ${C.rule}` : "none", background: C.white, textDecoration: "none", transition: "background 0.1s" }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.surface}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = C.white}
                          >
                            <div style={{ fontFamily: F.sans, fontSize: 13.5, fontWeight: 500, color: C.ink }}>Manual {m.number}</div>
                            <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 300, color: C.ink5 }}>{m.language.toUpperCase()}</div>
                            <div style={{ fontFamily: F.sans, fontSize: 12, color: C.blue, textAlign: "right" }}>Download →</div>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontFamily: F.sans, fontSize: 13.5, fontWeight: 300, color: C.ink5 }}>No manuals available for this VIN.</div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* FAQ + How it works block — white */}
            <section id="how-it-works" style={{ background: C.white, padding: "56px 48px 72px" }}>
              <div style={{ maxWidth: 900, margin: "0 auto" }}>

                {/* How it works */}
                <h2 style={{ fontFamily: F.sans, fontWeight: 700, fontSize: "clamp(20px, 2.5vw, 28px)", letterSpacing: "-0.02em", color: C.ink, margin: "0 0 32px" }}>
                  How it works.
                </h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 56 }}>
                  {[
                    { n: "01", title: "Structural decode.", body: "WMI, VDS, and VIS segments extracted. Check digit validated against the ISO 3779 formula." },
                    { n: "02", title: "Factory enrichment.", body: "VDS cross-referenced against BMW's internal production data to resolve chassis, engine, market, and build options." },
                    { n: "03", title: "Catalog match.", body: "Chassis code mapped to the OEM parts catalog on bmv.parts. Jump straight to diagrams and part numbers." },
                  ].map(s => (
                    <div key={s.n} style={{ background: C.white, border: `1px solid ${C.rule}`, borderRadius: 10, padding: "26px 24px" }}>
                      <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, letterSpacing: "0.10em", color: C.blue, marginBottom: 10 }}>{s.n}</div>
                      <div style={{ fontFamily: F.sans, fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", color: C.ink, marginBottom: 8 }}>{s.title}</div>
                      <div style={{ fontFamily: F.sans, fontSize: 13.5, fontWeight: 300, lineHeight: 1.65, color: C.ink4 }}>{s.body}</div>
                    </div>
                  ))}
                </div>

                {/* Divider */}
                <div style={{ borderTop: `1px solid ${C.rule}`, marginBottom: 48 }} />

                {/* FAQ */}
                <h2 style={{ fontFamily: F.sans, fontWeight: 700, fontSize: "clamp(18px, 2vw, 24px)", letterSpacing: "-0.02em", color: C.ink, margin: "0 0 24px" }}>
                  Frequently asked questions.
                </h2>
                <FaqAccordion items={[
                  { q: "Is this BMW VIN decoder free?", a: "Yes. Decoding any BMW VIN on bmv.vin is free and requires no account." },
                  { q: "What does a BMW VIN tell you?", a: "A BMW VIN encodes the manufacturer (WMI), model line and body (VDS), the check digit, model year, assembly plant, and a unique production sequence. Combined with BMW's factory build records it also reveals every option code, original paint, and upholstery." },
                  { q: "Can I decode just the last 7 of my VIN?", a: "Yes. The last 7 characters of a BMW VIN are the production sequence and are unique within a given chassis and plant. Enter either the full 17-character VIN or the 7-character production sequence." },
                  { q: "Do you support every BMW chassis?", a: "We cover every modern BMW chassis from the early E-series through the current G, U and i series. MINI, Rolls-Royce and BMW Motorrad VINs using a BMW-issued WMI are also supported." },
                  { q: "Is bimmer.work down? Can I use bmv.vin instead?", a: "Yes. bmv.vin uses the same factory-options pipeline as bimmer.work, so when bimmer.work is slow or unreachable you can decode the same VIN here and get equivalent chassis, paint and option-code detail." },
                  { q: "Why does my VIN show 'partially enriched'?", a: "Some very recent builds or grey-market chassis are not yet present in the public BMW factory records we cache. The structural decode (chassis, engine, plant, model year) still works; option enrichment may follow as factory data is published." },
                  { q: "Does this work for ALPINA, MINI, Rolls-Royce or BMW Motorrad?", a: "Yes. ALPINA-built BMWs use the WBA/WBS WMI and decode through the same pipeline. MINI (WMW), Rolls-Royce (SBM) and BMW Motorrad (WBW/WUF) all use BMW-issued VINs and resolve into the same chassis-hub and series-hub navigation." },
                ]} />

                {/* Divider */}
                <div style={{ borderTop: `1px solid ${C.rule}`, marginTop: 48, paddingTop: 40 }}>
                  <h3 style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em", color: C.ink, margin: "0 0 20px" }}>Decode another VIN.</h3>
                  <CellInstrument
                    value={secondVin}
                    onChange={setSecondVin}
                    onDecode={() => {
                      const clean = secondVin.replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase();
                      if (clean.length === 17) navigate(`/${clean}`);
                    }}
                    isDecoding={false}
                  />
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
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

export function BmvVinDecoderPage({ vin }: { vin: string }) {
  return <BmvVinDecoder vin={vin} />;
}

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
