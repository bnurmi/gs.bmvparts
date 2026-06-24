import { useState } from "react";
import { ChevronRight } from "lucide-react";

const SIDEBAR_BG = "#08090B";
const SIDEBAR_BORDER = "#2A313E";
const SIDEBAR_FG = "rgba(242,242,242,0.95)";
const SIDEBAR_FG_DIM = "rgba(242,242,242,0.50)";
const SIDEBAR_ACCENT_BG = "#181C26";
const BMV_BLUE = "hsl(213 82% 55%)";
const BMV_BLUE_BG = "rgba(48,116,201,0.12)";

interface Variant {
  id: string;
  label: string;
}

interface ChassisRow {
  id: string;
  label: string;
  variants: Variant[];
}

const M_MODELS: ChassisRow[] = [
  {
    id: "g80",
    label: "G80 M3",
    variants: [
      { id: "g80-m3", label: "M3" },
      { id: "g80-m3-comp", label: "M3 Competition" },
      { id: "g80-m3-cs", label: "M3 CS" },
      { id: "g80-m3-comp-xd", label: "M3 Comp. M xDrive" },
    ],
  },
  {
    id: "g82",
    label: "G82 M4",
    variants: [
      { id: "g82-m4", label: "M4" },
      { id: "g82-m4-comp", label: "M4 Competition" },
      { id: "g82-m4-cs", label: "M4 CS" },
      { id: "g82-m4-csl", label: "M4 CSL" },
    ],
  },
  {
    id: "g87",
    label: "G87 M2",
    variants: [
      { id: "g87-m2", label: "M2" },
      { id: "g87-m2-comp", label: "M2 Competition" },
      { id: "g87-m2-cs", label: "M2 CS" },
    ],
  },
];

function ChassisItem({
  row,
  defaultOpen = false,
}: {
  row: ChassisRow;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [activeVariant, setActiveVariant] = useState<string | null>(
    defaultOpen ? row.variants[0].id : null
  );

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          background: open ? SIDEBAR_ACCENT_BG : "transparent",
          border: "none",
          cursor: "pointer",
          color: SIDEBAR_FG,
          fontSize: 13,
          borderRadius: 2,
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.background = SIDEBAR_ACCENT_BG)
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.background = open
            ? SIDEBAR_ACCENT_BG
            : "transparent")
        }
        data-testid={`chassis-toggle-${row.id}`}
      >
        <span style={{ fontFamily: "monospace", fontSize: 12, letterSpacing: "0.01em" }}>
          {row.label}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 10,
              color: SIDEBAR_FG_DIM,
            }}
          >
            {row.variants.length}
          </span>
          <ChevronRight
            size={12}
            color={SIDEBAR_FG_DIM}
            style={{
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.18s",
            }}
          />
        </div>
      </button>

      {open && (
        <div
          style={{
            paddingLeft: 12,
            borderLeft: `1px solid ${SIDEBAR_BORDER}`,
            marginLeft: 20,
            marginTop: 2,
            marginBottom: 4,
          }}
        >
          {row.variants.map((v) => {
            const isActive = activeVariant === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setActiveVariant(v.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  textAlign: "left",
                  padding: "5px 10px",
                  background: isActive ? BMV_BLUE_BG : "transparent",
                  border: "none",
                  borderLeft: isActive ? `2px solid ${BMV_BLUE}` : "2px solid transparent",
                  marginLeft: -1,
                  cursor: "pointer",
                  color: isActive ? BMV_BLUE : SIDEBAR_FG,
                  fontSize: 12.5,
                  borderRadius: "0 2px 2px 0",
                  transition: "all 0.12s",
                  fontFamily: "system-ui, sans-serif",
                }}
                onMouseEnter={(e) => {
                  if (!isActive)
                    (e.currentTarget as HTMLElement).style.background =
                      "rgba(255,255,255,0.04)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive)
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
                data-testid={`variant-${v.id}`}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SidebarInlineAccordion() {
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
        <div style={{ padding: "8px 4px", borderBottom: `1px solid ${SIDEBAR_BORDER}`, flexShrink: 0 }}>
          {["Dashboard", "Search Parts", "Part Finder", "VIN Decoder", "Models"].map((label) => (
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
          ))}
        </div>

        {/* M Models group */}
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
              M Models
            </span>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 10,
                color: SIDEBAR_FG_DIM,
                opacity: 0.6,
              }}
            >
              3
            </span>
          </div>

          {M_MODELS.map((row) => (
            <ChassisItem
              key={row.id}
              row={row}
              defaultOpen={row.id === "g80"}
            />
          ))}
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
          3 of 3 chassis synced
        </div>
      </div>
    </div>
  );
}
