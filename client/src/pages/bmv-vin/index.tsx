// =============================================================================
// bmv.vin — client-side thin-hydration pages
// Styled per DESIGN.md (2026-06-25). Inter + Space Mono only.
// These hydrate over SSR markup — they render minimal DOM so the server
// content remains the canonical crawlable view.
// =============================================================================

import { Link, useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Loader2 } from "lucide-react";
import { AiFaqSection } from "@/components/AiFaqSection";
import {
  BMV_VIN_BRANDS, BMV_VIN_FACET_KINDS, BRAND_LABEL, FACET_KIND_LABEL,
  type BmvVinBrand, type BmvVinFacetKind,
} from "../../../../shared/bmv-vin/feature-registry";

// =============================================================================
// Design tokens — applied via inline styles where Tailwind doesn't reach
// =============================================================================
const T = {
  blue:       "#1C69D4",
  blueDark:   "#0F4FA8",
  blueMid:    "#3578D8",
  blueTint:   "#EBF1FB",
  ink:        "#0A0A0C",
  ink3:       "#3D3D48",
  ink4:       "#6B6B7A",
  ink5:       "#9898A8",
  white:      "#FFFFFF",
  surface:    "#F7F7FA",
  rule:       "#E2E2EA",
  ruleMid:    "#CCCCD8",
  green:      "#0A7A3E",
  greenTint:  "#E8F5EE",
  red:        "#C41C24",
  redTint:    "#FDF0F0",
} as const;

// =============================================================================
// Shared components
// =============================================================================

/** Site header — sticky, blurred, wordmark only. */
function SiteHeader() {
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      height: 58, display: "flex", alignItems: "center",
      padding: "0 48px",
      background: "rgba(255,255,255,0.92)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      borderBottom: `1px solid ${T.rule}`,
    }}>
      <Link href="/" style={{ textDecoration: "none" }}>
        <span style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 700, fontSize: 17,
          letterSpacing: "-0.02em", color: T.ink,
        }}>
          bmv<span style={{ color: T.blue }}>.vin</span>
        </span>
      </Link>
    </header>
  );
}

/** Site footer — dark background. */
function SiteFooter() {
  return (
    <footer style={{
      background: T.ink, padding: "32px 48px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      flexWrap: "wrap", gap: 12,
    }}>
      <span style={{
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 700, fontSize: 15, color: T.white,
      }}>
        bmv<span style={{ color: T.blueMid }}>.vin</span>
      </span>
      <span style={{
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 12, color: "rgba(255,255,255,0.30)",
      }}>
        Vehicle identification data for reference purposes only.
      </span>
    </footer>
  );
}

/** Compact single-field VIN input (Variant B / constrained spaces). */
function CompactVinInput({ placeholder = "Paste any 17-character VIN" }: { placeholder?: string }) {
  const [vin, setVin] = useState("");
  const [, navigate] = useLocation();
  const isReady = vin.trim().length === 17;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = vin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
    if (cleaned.length === 17) navigate(`/${cleaned}`);
  }

  return (
    <form onSubmit={submit} style={{
      background: T.white,
      border: `1px solid ${T.ruleMid}`,
      borderRadius: 16,
      padding: "16px 20px",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <input
        data-testid="input-vin"
        value={vin}
        onChange={e => setVin(e.target.value.toUpperCase())}
        placeholder={placeholder}
        maxLength={17}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        style={{
          flex: 1,
          fontFamily: "'Space Mono', monospace",
          fontSize: 14, fontWeight: 400,
          letterSpacing: "0.10em",
          color: T.ink,
          border: "none", outline: "none",
          background: "transparent",
        }}
      />
      <span style={{
        fontFamily: "'Space Mono', monospace",
        fontSize: 11, color: isReady ? T.green : T.ink5,
        whiteSpace: "nowrap",
      }}>
        {vin.trim().length} / 17
      </span>
      <button
        type="submit"
        disabled={!isReady}
        data-testid="button-decode"
        style={{
          height: 40, padding: "0 20px",
          background: isReady ? T.blue : T.ruleMid,
          color: isReady ? T.white : T.ink5,
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 600, fontSize: 13,
          letterSpacing: "0.04em",
          borderRadius: 6, border: "none",
          cursor: isReady ? "pointer" : "not-allowed",
          transition: "background 0.12s",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={e => { if (isReady) (e.target as HTMLElement).style.background = T.blueDark; }}
        onMouseLeave={e => { if (isReady) (e.target as HTMLElement).style.background = T.blue; }}
      >
        Decode
      </button>
    </form>
  );
}

/** Browse button tile — used in By brand / By facet grids. */
function BrowseTile({ href, label, testId }: { href: string; label: string; testId?: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link href={href} data-testid={testId} style={{ textDecoration: "none" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: hovered ? T.surface : T.white,
          border: `1px solid ${hovered ? T.ruleMid : T.rule}`,
          borderRadius: 10,
          padding: "18px 16px",
          minHeight: 56,
          display: "flex", alignItems: "center", justifyContent: "center",
          textAlign: "center",
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 400, fontSize: 15,
          color: T.ink,
          transition: "border-color 0.12s, background 0.12s",
          cursor: "pointer",
        }}
      >
        {label}
      </div>
    </Link>
  );
}

/** Browse section heading (nav label, no full stop). */
function BrowseHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontFamily: "Inter, system-ui, sans-serif",
      fontWeight: 700, fontSize: 20,
      letterSpacing: "-0.01em",
      color: T.ink,
      margin: "0 0 16px",
    }}>
      {children}
    </h2>
  );
}

/** Breadcrumb nav. */
function Crumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav data-testid="crumb-bmv-vin" style={{
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 13, color: T.ink4,
      marginBottom: 20,
      display: "flex", alignItems: "center", gap: 6,
    }}>
      {items.map((it, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {i > 0 && <span style={{ color: T.ruleMid }}>›</span>}
          {it.href
            ? <Link href={it.href} style={{ color: T.ink4, textDecoration: "none" }}
                onMouseEnter={e => (e.target as HTMLElement).style.color = T.ink}
                onMouseLeave={e => (e.target as HTMLElement).style.color = T.ink4}
              >{it.label}</Link>
            : <span style={{ color: T.ink3 }}>{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/** Page shell — header + content + footer, surface background. */
function PageShell({ children, bg = T.surface }: { children: React.ReactNode; bg?: string }) {
  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column" }}>
      <SiteHeader />
      <main style={{ flex: 1 }}>{children}</main>
      <SiteFooter />
    </div>
  );
}

/** Centred content wrapper. */
function Content({ children, maxWidth = 900 }: { children: React.ReactNode; maxWidth?: number }) {
  return (
    <div style={{
      maxWidth, margin: "0 auto",
      padding: "48px 48px",
    }}>
      {children}
    </div>
  );
}

// =============================================================================
// Decoder Home — Variant B (homepage browse)
// =============================================================================
export function DecoderHome() {
  return (
    <PageShell bg={T.surface}>
      <Helmet><title>VIN Decoder for BMW Group — bmv.vin</title></Helmet>
      <Content>
        {/* Compact VIN input */}
        <div style={{ marginBottom: 32 }}>
          <CompactVinInput />
        </div>

        {/* By brand */}
        <BrowseHeading>By brand</BrowseHeading>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
          marginBottom: 32,
        }}>
          {BMV_VIN_BRANDS.map(b => (
            <BrowseTile
              key={b}
              href={`/decoder/${b}`}
              label={BRAND_LABEL[b]}
              testId={`link-brand-${b}`}
            />
          ))}
        </div>

        {/* By facet */}
        <BrowseHeading>By facet</BrowseHeading>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
          marginBottom: 24,
        }}>
          {BMV_VIN_FACET_KINDS.map(k => (
            <BrowseTile
              key={k}
              href={`/${k}`}
              label={FACET_KIND_LABEL[k]}
              testId={`link-facet-${k}`}
            />
          ))}
        </div>

        {/* Footer text links */}
        <div style={{ display: "flex", gap: 16 }}>
          <Link href="/guide" data-testid="link-guide-index" style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 400, fontSize: 14,
            color: T.blue, textDecoration: "none",
          }}
            onMouseEnter={e => { (e.target as HTMLElement).style.color = T.blueDark; (e.target as HTMLElement).style.textDecoration = "underline"; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.color = T.blue; (e.target as HTMLElement).style.textDecoration = "none"; }}
          >Guide library</Link>
          <Link href="/glossary" data-testid="link-glossary-index" style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 400, fontSize: 14,
            color: T.blue, textDecoration: "none",
          }}
            onMouseEnter={e => { (e.target as HTMLElement).style.color = T.blueDark; (e.target as HTMLElement).style.textDecoration = "underline"; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.color = T.blue; (e.target as HTMLElement).style.textDecoration = "none"; }}
          >Glossary</Link>
        </div>
      </Content>
    </PageShell>
  );
}

// =============================================================================
// Brand Decoder Hub — Variant A lite
// =============================================================================
export function BrandDecoderHub() {
  const [, params] = useRoute("/decoder/:brand");
  const brand = (params?.brand ?? "bmw") as BmvVinBrand;
  const label = BRAND_LABEL[brand] || brand;
  return (
    <PageShell bg={T.white}>
      <Helmet><title>{label} VIN Decoder — bmv.vin</title></Helmet>
      <Content>
        <Crumb items={[{ label: "Decoder", href: "/" }, { label }]} />
        <h1 style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 700,
          fontSize: "clamp(32px, 5vw, 56px)",
          letterSpacing: "-0.025em",
          lineHeight: 1.0,
          color: T.ink,
          margin: "0 0 8px",
        }}>
          {label} VIN decoder.
        </h1>
        <p style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 300, fontSize: 16,
          lineHeight: 1.65, color: T.ink4,
          margin: "0 0 32px",
        }}>
          Decode any {label} vehicle identification number. Free, instant, no signup.
        </p>
        <CompactVinInput placeholder={`Paste a ${label} VIN`} />
      </Content>
    </PageShell>
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
    <PageShell bg={T.white}>
      <Helmet><title>{label} {value} — bmv.vin</title></Helmet>
      <Content>
        <Crumb items={[
          { label: "Decoder", href: "/" },
          { label, href: `/${kind}` },
          { label: value },
        ]} />
        <h1 style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 700, fontSize: "clamp(28px, 4vw, 48px)",
          letterSpacing: "-0.025em", lineHeight: 1.0,
          color: T.ink, margin: "0 0 32px",
        }}>
          {label}: {value}.
        </h1>
        {kind && value && (
          <AiFaqSection
            pageType="facet"
            pageKey={`${kind}:${value.toLowerCase()}`}
            locale={locale}
          />
        )}
      </Content>
    </PageShell>
  );
}

// =============================================================================
// Guide library
// =============================================================================
type Guide = { id: number; slug: string; title: any; summary: any; updatedAt: string | null };

function pickEn(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  return v.en || Object.values(v)[0] || "";
}

export function GuideIndex() {
  const { data, isLoading } = useQuery<{ guides: Guide[] }>({ queryKey: ["/api/bmv-vin/guides"] });
  return (
    <PageShell bg={T.white}>
      <Helmet><title>Guide library — bmv.vin</title></Helmet>
      <Content>
        <Crumb items={[{ label: "Decoder", href: "/" }, { label: "Guides" }]} />
        <h1 style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 700, fontSize: "clamp(28px, 4vw, 40px)",
          letterSpacing: "-0.025em", lineHeight: 1.0,
          color: T.ink, margin: "0 0 32px",
        }}>Guide library.</h1>
        {isLoading && <Loader2 style={{ width: 20, height: 20, color: T.blue }} className="animate-spin" />}
        <div style={{ display: "grid", gap: 10 }}>
          {(data?.guides ?? []).map(g => (
            <Link key={g.id} href={`/guide/${g.slug}`} data-testid={`link-guide-${g.slug}`}
              style={{ textDecoration: "none" }}>
              <div style={{
                background: T.white, border: `1px solid ${T.rule}`,
                borderRadius: 10, padding: "20px 22px",
                transition: "border-color 0.12s",
              }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = T.ruleMid}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = T.rule}
              >
                <div style={{
                  fontFamily: "Inter, system-ui, sans-serif",
                  fontWeight: 700, fontSize: 16,
                  letterSpacing: "-0.01em", color: T.ink,
                  marginBottom: 4,
                }}>{pickEn(g.title)}</div>
                <div style={{
                  fontFamily: "Inter, system-ui, sans-serif",
                  fontWeight: 300, fontSize: 13.5,
                  lineHeight: 1.65, color: T.ink4,
                }}>{pickEn(g.summary)}</div>
              </div>
            </Link>
          ))}
        </div>
      </Content>
    </PageShell>
  );
}

export function GuideDetail() {
  const [, params] = useRoute("/guide/:slug");
  const slug = params?.slug ?? "";
  const { data } = useQuery<{ guide: Guide | null }>({
    queryKey: ["/api/bmv-vin/guides", slug],
    enabled: !!slug,
  });
  return (
    <PageShell bg={T.white}>
      <Helmet><title>{pickEn(data?.guide?.title) || "Guide"} — bmv.vin</title></Helmet>
      <Content maxWidth={720}>
        <Crumb items={[{ label: "Decoder", href: "/" }, { label: "Guides", href: "/guide" }, { label: pickEn(data?.guide?.title) || slug }]} />
        <h1 style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 700, fontSize: "clamp(24px, 3.5vw, 36px)",
          letterSpacing: "-0.02em", lineHeight: 1.1,
          color: T.ink, margin: "0 0 24px",
        }}>{pickEn(data?.guide?.title) || slug}.</h1>
        <p style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 300, fontSize: 15, lineHeight: 1.7,
          color: T.ink4,
        }}>See the full guide content below.</p>
      </Content>
    </PageShell>
  );
}

// =============================================================================
// Glossary
// =============================================================================
type Term = { id: number; term: string; termSet: string | null; display: any; definition: any };

export function GlossaryIndex() {
  const { data, isLoading } = useQuery<{ terms: Term[] }>({ queryKey: ["/api/bmv-vin/glossary"] });
  const grouped = (data?.terms ?? []).reduce<Record<string, Term[]>>((acc, t) => {
    const k = t.termSet || "other";
    (acc[k] ||= []).push(t);
    return acc;
  }, {});
  return (
    <PageShell bg={T.white}>
      <Helmet><title>Glossary — bmv.vin</title></Helmet>
      <Content>
        <Crumb items={[{ label: "Decoder", href: "/" }, { label: "Glossary" }]} />
        <h1 style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 700, fontSize: "clamp(28px, 4vw, 40px)",
          letterSpacing: "-0.025em", lineHeight: 1.0,
          color: T.ink, margin: "0 0 32px",
        }}>Glossary.</h1>
        {isLoading && <Loader2 style={{ width: 20, height: 20, color: T.blue }} className="animate-spin" />}
        {Object.entries(grouped).map(([set, terms]) => (
          <section key={set} style={{ marginBottom: 32 }}>
            <h2 style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontWeight: 700, fontSize: 16,
              letterSpacing: "-0.01em", color: T.ink,
              margin: "0 0 12px",
            }}>{set}</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {terms.map(t => (
                <Link key={t.id} href={`/glossary/${t.term}`} data-testid={`link-term-${t.term}`}
                  style={{ textDecoration: "none" }}>
                  <span style={{
                    display: "inline-block",
                    padding: "6px 12px",
                    border: `1px solid ${T.rule}`,
                    borderRadius: 6,
                    fontFamily: "Inter, system-ui, sans-serif",
                    fontWeight: 400, fontSize: 13.5,
                    color: T.ink3,
                    background: T.white,
                    transition: "border-color 0.12s, background 0.12s",
                    cursor: "pointer",
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = T.blue; (e.currentTarget as HTMLElement).style.background = T.blueTint; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.rule; (e.currentTarget as HTMLElement).style.background = T.white; }}
                  >
                    {pickEn(t.display) || t.term}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </Content>
    </PageShell>
  );
}

export function GlossaryTerm() {
  const [, params] = useRoute("/glossary/:term");
  const term = params?.term ?? "";
  const { data } = useQuery<{ term: Term | null }>({
    queryKey: ["/api/bmv-vin/glossary", term],
    enabled: !!term,
  });
  return (
    <PageShell bg={T.white}>
      <Helmet><title>{pickEn(data?.term?.display) || term} — bmv.vin glossary</title></Helmet>
      <Content maxWidth={720}>
        <Crumb items={[{ label: "Decoder", href: "/" }, { label: "Glossary", href: "/glossary" }, { label: pickEn(data?.term?.display) || term }]} />
        <h1 style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 700, fontSize: "clamp(24px, 3.5vw, 36px)",
          letterSpacing: "-0.02em", lineHeight: 1.1,
          color: T.ink, margin: "0 0 24px",
        }}>{pickEn(data?.term?.display) || term}.</h1>
        <p style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 300, fontSize: 15, lineHeight: 1.7,
          color: T.ink4,
        }}>See the definition below.</p>
      </Content>
    </PageShell>
  );
}

// =============================================================================
// SEO growth pages — Variant A lite (thin hydration over SSR)
// =============================================================================

function SeoPageShell({ title, subtitle, testId }: { title: string; subtitle?: string; testId?: string }) {
  return (
    <PageShell bg={T.white}>
      <Content>
        <h1 style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 700, fontSize: "clamp(24px, 3.5vw, 40px)",
          letterSpacing: "-0.025em", lineHeight: 1.0,
          color: T.ink, margin: "0 0 8px",
        }} data-testid={testId}>{title}.</h1>
        {subtitle && (
          <p style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 300, fontSize: 15, lineHeight: 1.7,
            color: T.ink4, margin: "0 0 32px",
          }}>{subtitle}</p>
        )}
        <CompactVinInput />
      </Content>
    </PageShell>
  );
}

export function VinToolPage() {
  const [currentPath] = useLocation();
  const slug = currentPath.replace(/^\//, "");
  const title = slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return (
    <>
      <Helmet>
        <title>{title} — bmv.vin</title>
        <link rel="canonical" href={`https://bmv.vin/${slug}`} />
      </Helmet>
      <SeoPageShell
        title={title}
        subtitle="Free BMW lookup tool. Enter any 17-character VIN to get instant results."
        testId={`page-vin-tool-${slug}`}
      />
    </>
  );
}

export function ModelVinPage() {
  const [currentPath] = useLocation();
  const vinDecoderMatch = currentPath.match(/^\/bmw-([a-z0-9]+)-vin-decoder$/);
  const modelLandingMatch = !vinDecoderMatch ? currentPath.match(/^\/bmw-([a-z0-9-]+)$/) : null;
  const chassis = vinDecoderMatch ? vinDecoderMatch[1].toUpperCase() : "";
  const modelSlug = modelLandingMatch ? modelLandingMatch[1] : "";
  const modelName = modelSlug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  if (vinDecoderMatch) {
    return (
      <>
        <Helmet>
          <title>BMW {chassis} VIN Decoder — bmv.vin</title>
          <link rel="canonical" href={`https://bmv.vin/bmw-${chassis.toLowerCase()}-vin-decoder`} />
        </Helmet>
        <SeoPageShell
          title={`BMW ${chassis} VIN Decoder`}
          subtitle={`Decode any BMW ${chassis} VIN. Get build sheet, options, paint code, and production date.`}
          testId={`page-model-vin-${chassis.toLowerCase()}`}
        />
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>{modelName ? `BMW ${modelName} VIN Lookup` : "BMW VIN Lookup"} — bmv.vin</title>
        {modelSlug && <link rel="canonical" href={`https://bmv.vin/bmw-${modelSlug}`} />}
      </Helmet>
      <SeoPageShell
        title={modelName ? `BMW ${modelName} VIN Lookup` : "BMW VIN Lookup"}
        subtitle={modelName
          ? `Decode any BMW ${modelName} VIN. Get build sheet, options, paint code, and production date.`
          : "Free BMW lookup tool. Enter any 17-character VIN to get instant results."}
        testId={`page-model-landing-${modelSlug || "unknown"}`}
      />
    </>
  );
}

export function ComparePage() {
  const [, params] = useRoute("/compare/:slug");
  const slug = params?.slug ?? "";
  const title = slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return (
    <>
      <Helmet>
        <title>{title} — bmv.vin</title>
        <link rel="canonical" href={`https://bmv.vin/compare/${slug}`} />
      </Helmet>
      <SeoPageShell title={title} testId={`page-compare-${slug}`} />
    </>
  );
}

export function DataPage() {
  const [, params] = useRoute("/data/:slug");
  const slug = params?.slug ?? "";
  const title = slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return (
    <>
      <Helmet>
        <title>{title} — BMW VIN Data | bmv.vin</title>
        <link rel="canonical" href={`https://bmv.vin/data/${slug}`} />
      </Helmet>
      <SeoPageShell title={title} testId={`page-data-${slug}`} />
    </>
  );
}
