import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const SIDEBAR_BG = "#08090B";
const SIDEBAR_BORDER = "#2A313E";
const SIDEBAR_FG = "rgba(242,242,242,0.95)";
const SIDEBAR_FG_DIM = "rgba(242,242,242,0.50)";
const SIDEBAR_ACCENT_BG = "#181C26";
const BMV_BLUE = "hsl(213 82% 55%)";
const BMV_BLUE_BG = "rgba(48,116,201,0.12)";

const ALL_VARIANTS = [
  "318i",
  "320i",
  "323i",
  "325i",
  "325xi",
  "328i",
  "330i",
  "330xi",
  "335i",
  "335xi",
  "320d",
  "320d N47",
  "325d",
  "330d",
  "335d",
  "M3",
];

export default function SidebarDrawerPicker() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeVariant, setActiveVariant] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = ALL_VARIANTS.filter((v) =>
    v.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      style={{
        width: 390,
        height: 844,
        background: "#0F1117",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          background: SIDEBAR_BG,
          display: "flex",
          flexDirection: "column",
          fontFamily: "system-ui, -apple-system, sans-serif",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 12px 12px",
            borderBottom: `1px solid ${SIDEBAR_BORDER}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: SIDEBAR_FG,
            }}
          >
            BMV.parts
          </div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 10,
              color: SIDEBAR_FG_DIM,
              marginTop: 3,
              letterSpacing: "0.05em",
            }}
          >
            5,970,000 parts indexed
          </div>
        </div>

        {/* Nav items */}
        <div
          style={{
            padding: "8px 4px",
            borderBottom: `1px solid ${SIDEBAR_BORDER}`,
            flexShrink: 0,
          }}
        >
          {["Dashboard", "Search Parts", "Part Finder", "VIN Decoder", "Models"].map(
            (label) => (
              <div
                key={label}
                style={{
                  padding: "7px 10px",
                  fontSize: 13,
                  color: SIDEBAR_FG_DIM,
                  cursor: "default",
                  borderRadius: 2,
                }}
              >
                {label}
              </div>
            )
          )}
        </div>

        {/* Exx Models group */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 4px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 8px 6px",
            }}
          >
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 10,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: SIDEBAR_FG_DIM,
              }}
            >
              Exx Models
            </span>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 10,
                color: SIDEBAR_FG_DIM,
                opacity: 0.6,
              }}
            >
              4
            </span>
          </div>

          {/* Static chassis items */}
          {["E46 3 Series", "E60 5 Series", "E92 3 Series Coupé"].map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 12px",
                color: SIDEBAR_FG_DIM,
                fontSize: 13,
                borderRadius: 2,
                fontFamily: "monospace",
                cursor: "default",
              }}
            >
              <span style={{ fontSize: 12 }}>{label}</span>
            </div>
          ))}

          {/* E90 — drawer-trigger row */}
          <button
            onClick={() => {
              setQuery("");
              setSheetOpen(true);
            }}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 12px",
              background: activeVariant ? BMV_BLUE_BG : "transparent",
              border: "none",
              borderLeft: activeVariant
                ? `2px solid ${BMV_BLUE}`
                : "2px solid transparent",
              cursor: "pointer",
              color: activeVariant ? BMV_BLUE : SIDEBAR_FG,
              fontSize: 13,
              borderRadius: "0 2px 2px 0",
              transition: "background 0.15s",
              marginLeft: -1,
            }}
            onMouseEnter={(e) => {
              if (!activeVariant)
                (e.currentTarget as HTMLElement).style.background = SIDEBAR_ACCENT_BG;
            }}
            onMouseLeave={(e) => {
              if (!activeVariant)
                (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
            data-testid="chassis-e90-trigger"
          >
            <span style={{ fontFamily: "monospace", fontSize: 12, textAlign: "left" }}>
              E90 3 Series
              {activeVariant && (
                <span
                  style={{
                    display: "block",
                    fontSize: 10.5,
                    color: BMV_BLUE,
                    marginTop: 1,
                    fontWeight: 400,
                  }}
                >
                  {activeVariant}
                </span>
              )}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 9.5,
                  color: SIDEBAR_FG_DIM,
                }}
              >
                16
              </span>
              <ChevronRight
                size={12}
                color={activeVariant ? BMV_BLUE : SIDEBAR_FG_DIM}
              />
            </div>
          </button>
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: `1px solid ${SIDEBAR_BORDER}`,
            padding: "8px 12px",
            fontSize: 11,
            color: SIDEBAR_FG_DIM,
            fontFamily: "monospace",
            flexShrink: 0,
          }}
        >
          4 of 4 chassis synced
        </div>

        {/* Shadcn Sheet — bottom on mobile */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="bottom"
            className="p-0 border-t"
            style={{
              background: "#141821",
              borderColor: SIDEBAR_BORDER,
              borderRadius: "10px 10px 0 0",
              maxHeight: "65%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <SheetHeader
              style={{
                padding: "14px 16px 10px",
                borderBottom: `1px solid ${SIDEBAR_BORDER}`,
                flexShrink: 0,
              }}
            >
              <SheetTitle
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: SIDEBAR_FG_DIM,
                  fontWeight: 400,
                }}
              >
                E90 3 Series — select variant
              </SheetTitle>
            </SheetHeader>

            {/* Search input */}
            <div style={{ padding: "10px 12px 8px", flexShrink: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#0C0F14",
                  border: `1px solid ${SIDEBAR_BORDER}`,
                  borderRadius: 2,
                  padding: "7px 10px",
                }}
              >
                <Search size={13} color={SIDEBAR_FG_DIM} />
                <input
                  type="search"
                  placeholder="Filter variants…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  style={{
                    background: "none",
                    border: "none",
                    outline: "none",
                    color: SIDEBAR_FG,
                    fontSize: 13,
                    flex: 1,
                    fontFamily: "system-ui, sans-serif",
                  }}
                  data-testid="sheet-search"
                />
              </div>
            </div>

            {/* Variant list */}
            <div style={{ overflowY: "auto", flex: 1, padding: "4px 8px 16px" }}>
              {filtered.length === 0 ? (
                <div
                  style={{
                    padding: "20px 12px",
                    color: SIDEBAR_FG_DIM,
                    fontSize: 12,
                    fontFamily: "monospace",
                    textAlign: "center",
                  }}
                >
                  No variants match "{query}"
                </div>
              ) : (
                filtered.map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      setActiveVariant(v);
                      setSheetOpen(false);
                    }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      textAlign: "left",
                      padding: "9px 10px",
                      background: "transparent",
                      border: "none",
                      borderRadius: 2,
                      cursor: "pointer",
                      color: SIDEBAR_FG,
                      fontSize: 13,
                      fontFamily: "system-ui, sans-serif",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = SIDEBAR_ACCENT_BG;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                    data-testid={`sheet-variant-${v.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    {v}
                  </button>
                ))
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
