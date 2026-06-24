export default function Canvas() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const frame1Src = `${base}/preview/SidebarInlineAccordion`;
  const frame2Src = `${base}/preview/SidebarDrawerPicker`;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0C0F14",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 40px",
        fontFamily:
          '"Inter Tight", "Inter", system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Page heading */}
      <div style={{ marginBottom: 40, textAlign: "center" }}>
        <div
          style={{
            fontFamily: '"JetBrains Mono", "Menlo", monospace',
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "rgba(242,242,242,0.35)",
            marginBottom: 8,
          }}
        >
          Task #183 — Sidebar variant navigation
        </div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: "rgba(242,242,242,0.90)",
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          Chassis → Variant navigation patterns
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "rgba(242,242,242,0.40)",
            marginTop: 8,
            maxWidth: 520,
            lineHeight: 1.6,
          }}
        >
          Two interaction models depending on variant count. Tap chassis rows,
          expand sub-items, and open the drawer sheet to see them in action.
        </p>
      </div>

      {/* Two mobile-sized iframe frames, side by side */}
      <div
        style={{
          display: "flex",
          gap: 56,
          alignItems: "flex-start",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {/* Frame 1 — inline accordion */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <FrameLabel
            threshold="≤ 6 variants"
            title="Inline accordion"
            description="Each chassis row expands in-place. Tapping a variant marks it active."
            accent="hsl(213 82% 55%)"
          />
          <PhoneFrame>
            <iframe
              src={frame1Src}
              width={390}
              height={844}
              style={{ border: "none", display: "block" }}
              title="Inline accordion mockup"
            />
          </PhoneFrame>
          <FrameHint>
            G80 M3 is pre-expanded · tap G82 or G87 to expand/collapse
          </FrameHint>
        </div>

        {/* Divider */}
        <div
          style={{
            width: 1,
            background: "rgba(255,255,255,0.06)",
            alignSelf: "stretch",
            minHeight: 500,
          }}
        />

        {/* Frame 2 — drawer picker */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <FrameLabel
            threshold="> 6 variants"
            title="Drawer picker"
            description='Chassis row shows a chevron-right. Tapping slides up a searchable bottom sheet.'
            accent="hsl(213 82% 55%)"
          />
          <PhoneFrame>
            <iframe
              src={frame2Src}
              width={390}
              height={844}
              style={{ border: "none", display: "block" }}
              title="Drawer picker mockup"
            />
          </PhoneFrame>
          <FrameHint>
            Tap "E90 3 Series" to open the sheet · type to filter
          </FrameHint>
        </div>
      </div>

      {/* Colour legend */}
      <div
        style={{
          marginTop: 48,
          display: "flex",
          gap: 32,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {[
          { color: "hsl(213 82% 55%)", label: "BMV blue — active / accent" },
          { color: "rgba(242,242,242,0.95)", label: "Sidebar foreground" },
          { color: "#2A313E", label: "Sidebar border" },
          { color: "#181C26", label: "Sidebar accent bg (hover/open)" },
          { color: "#08090B", label: "Sidebar background (ink)" },
        ].map((item) => (
          <div
            key={item.label}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: item.color,
                border: "1px solid rgba(255,255,255,0.10)",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: '"JetBrains Mono", "Menlo", monospace',
                fontSize: 10.5,
                color: "rgba(242,242,242,0.35)",
              }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FrameLabel({
  threshold,
  title,
  description,
  accent,
}: {
  threshold: string;
  title: string;
  description: string;
  accent: string;
}) {
  return (
    <div style={{ textAlign: "center", maxWidth: 340 }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          background: "rgba(48,116,201,0.10)",
          border: "1px solid rgba(48,116,201,0.33)",
          borderRadius: 2,
          padding: "3px 8px",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontFamily: '"JetBrains Mono", "Menlo", monospace',
            fontSize: 10,
            letterSpacing: "0.10em",
            color: accent,
            textTransform: "uppercase",
          }}
        >
          {threshold}
        </span>
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "rgba(242,242,242,0.88)",
          marginBottom: 5,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "rgba(242,242,242,0.38)",
          lineHeight: 1.6,
        }}
      >
        {description}
      </div>
    </div>
  );
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 390 + 24,
        height: 844 + 24,
        background: "#1A1D24",
        borderRadius: 44,
        padding: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 34,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function FrameHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: '"JetBrains Mono", "Menlo", monospace',
        fontSize: 10,
        color: "rgba(242,242,242,0.25)",
        letterSpacing: "0.04em",
        textAlign: "center",
        maxWidth: 320,
      }}
    >
      {children}
    </div>
  );
}
