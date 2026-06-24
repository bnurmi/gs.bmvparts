// =============================================================================
// Admin panel for the bmv.vin content tables (Task #96, T010).
// =============================================================================
//
// Five-tab JSON editor over the bmv_vin_* tables (home copy, brand decoder,
// facet blurbs, guides, glossary) plus a coverage tile that shows how many
// vin_cache cohorts currently have an authored blurb. Each editor is a thin
// JSONB textarea — fine for an internal admin tool, and matches the shape of
// the storage rows so the seed file can be copy-pasted in.
// =============================================================================

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Trash2, Eye, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

function asJson(v: unknown): string {
  try { return JSON.stringify(v ?? {}, null, 2); } catch { return "{}"; }
}
function parseJsonOrNull(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

// ---------- Coverage tile ---------------------------------------------------
type ContentPageType = "home" | "brand" | "facet" | "guide" | "glossary";
interface ContentCoverage {
  locales: string[];
  pageTypes: { key: ContentPageType; total: number; perLocale: Record<string, number> }[];
}
interface CoverageData {
  chassis: { value: string; count: number }[];
  year:    { value: string; count: number }[];
  plant:   { value: string; count: number }[];
  market:  { value: string; count: number }[];
  blurbs:  { facetKind: string; facetValue: string }[];
  content?: ContentCoverage;
}

/** Threshold below which a (page-type, locale) cell is highlighted as
 *  "needs attention". 80% lets us flag both literally-empty locales and
 *  partially-translated ones. */
const COVERAGE_THRESHOLD = 0.8;

/** Map page-type → which content tab to switch to when an editor clicks a
 *  heatmap cell. Kept outside the component so the tab state lift in the
 *  panel can reuse the same union. */
const PAGE_TYPE_TO_TAB: Record<ContentPageType, string> = {
  home: "home", brand: "brand", facet: "facet", guide: "guides", glossary: "glossary",
};

function CoverageHeatmap({
  content,
  onCellClick,
}: {
  content: ContentCoverage;
  onCellClick: (pageType: ContentPageType, locale: string) => void;
}) {
  const { locales, pageTypes } = content;
  const cellClass = (covered: number, total: number) => {
    if (total === 0) return "bg-muted text-muted-foreground";
    const ratio = covered / total;
    if (ratio >= 1)                  return "bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-100";
    if (ratio >= COVERAGE_THRESHOLD) return "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-900 dark:text-yellow-100";
    return "bg-red-100 dark:bg-red-900/40 text-red-900 dark:text-red-100";
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Content coverage heatmap</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse" data-testid="table-coverage-heatmap">
            <thead>
              <tr>
                <th className="text-left px-2 py-1 sticky left-0 bg-background">Page type</th>
                {locales.map(l => (
                  <th key={l} className="px-2 py-1 font-mono font-medium text-muted-foreground">{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageTypes.map(pt => (
                <tr key={pt.key}>
                  <td className="px-2 py-1 font-medium sticky left-0 bg-background whitespace-nowrap">
                    {pt.key} <span className="text-muted-foreground">({pt.total})</span>
                  </td>
                  {locales.map(l => {
                    const covered = pt.perLocale[l] ?? 0;
                    return (
                      <td key={l} className="p-0.5">
                        <button
                          type="button"
                          data-testid={`cell-coverage-${pt.key}-${l}`}
                          disabled={pt.total === 0}
                          onClick={() => onCellClick(pt.key, l)}
                          className={`w-full min-w-[3.5rem] rounded px-2 py-1 font-mono hover-elevate disabled:cursor-default disabled:opacity-60 ${cellClass(covered, pt.total)}`}
                          title={pt.total === 0 ? "No rows yet" : `${covered}/${pt.total} authored — click to filter`}
                        >
                          {covered}/{pt.total}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-xs text-muted-foreground flex gap-3 flex-wrap">
          <span><span className="inline-block w-3 h-3 rounded bg-green-100 dark:bg-green-900/40 mr-1 align-middle" />complete</span>
          <span><span className="inline-block w-3 h-3 rounded bg-yellow-100 dark:bg-yellow-900/40 mr-1 align-middle" />≥{Math.round(COVERAGE_THRESHOLD * 100)}%</span>
          <span><span className="inline-block w-3 h-3 rounded bg-red-100 dark:bg-red-900/40 mr-1 align-middle" />needs copy</span>
          <span className="ml-auto">Click a cell to filter the editor to rows missing that locale.</span>
        </div>
      </CardContent>
    </Card>
  );
}

function CoverageTile({ onCellClick }: { onCellClick: (pt: ContentPageType, locale: string) => void }) {
  const { data, isLoading } = useQuery<CoverageData>({ queryKey: ["/api/admin/bmv-vin/coverage"] });

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin" />;
  if (!data) return null;
  const blurbSet = new Set((data.blurbs ?? []).map(b => `${b.facetKind}/${b.facetValue}`));
  const summarize = (kind: string, rows: { value: string; count: number }[]) => {
    const total = rows.length;
    const covered = rows.filter(r => blurbSet.has(`${kind}/${r.value}`)).length;
    return { total, covered };
  };
  const tiles = [
    { kind: "chassis", ...summarize("chassis", data.chassis) },
    { kind: "year",    ...summarize("year",    data.year) },
    { kind: "plant",   ...summarize("plant",   data.plant) },
    { kind: "market",  ...summarize("market",  data.market) },
  ];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Facet coverage</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {tiles.map(t => (
              <div key={t.kind} className="rounded border p-3" data-testid={`coverage-${t.kind}`}>
                <div className="text-xs text-muted-foreground uppercase">{t.kind}</div>
                <div className="text-2xl font-bold">{t.covered} / {t.total}</div>
                <div className="text-xs text-muted-foreground">cohorts with a blurb</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      {data.content && <CoverageHeatmap content={data.content} onCellClick={onCellClick} />}
    </div>
  );
}

// ---------- Generic CRUD list ----------------------------------------------
interface PreviewParams {
  type: "home" | "brand" | "facet-index" | "facet" | "guide-index" | "guide" | "glossary-index" | "glossary";
  kind?: string;
  value?: string;
}
interface CrudConfig<T> {
  endpoint: string;            // e.g. "/api/admin/bmv-vin/guides"
  rowKey: (row: T) => string;  // unique key for React + URL identifier
  rowLabel: (row: T) => string;
  newRow: () => T;
  fields: { key: keyof T; label: string; kind: "text" | "json" }[];
  /** Returns the SSR preview query for a row, or null if the row has no
   *  matching public page yet (e.g. an unsaved draft with empty slug). */
  previewParams?: (row: T) => PreviewParams | null;
  /** JSON field whose per-locale keys define "is this row authored for X?".
   *  Used by the heatmap deep-link filter to narrow the row list to rows
   *  missing copy in a given locale. Must match the field used by
   *  bmvVinStorage.getContentCoverage on the server. */
  localeContentField?: keyof T;
}

/** Renders the live SSR HTML for a content row in an iframe. The endpoint
 *  reuses the same builders the public host uses, so the preview matches
 *  exactly what crawlers will fetch. Locale is selectable so editors can
 *  spot-check Accept-Language fallbacks. */
function SsrPreviewModal({ params, onClose }: { params: PreviewParams; onClose: () => void }) {
  const [locale, setLocale] = useState("en");
  const qs = new URLSearchParams({ type: params.type });
  if (params.kind)  qs.set("kind", params.kind);
  if (params.value) qs.set("value", params.value);
  qs.set("locale", locale);
  const src = `/api/admin/bmv-vin/ssr-preview?${qs.toString()}`;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      data-testid="modal-bmv-vin-ssr-preview"
      onClick={onClose}
    >
      <div className="bg-background w-full max-w-5xl h-[85vh] rounded shadow-lg flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 border-b">
          <div className="text-sm font-medium">
            SSR preview · <span className="font-mono text-xs">{params.type}</span>
            {params.kind  && <> · <span className="font-mono text-xs">{params.kind}</span></>}
            {params.value && <> · <span className="font-mono text-xs">{params.value}</span></>}
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Locale</Label>
            <select
              data-testid="select-preview-locale"
              className="text-xs border rounded px-1 py-0.5 bg-background"
              value={locale}
              onChange={e => setLocale(e.target.value)}
            >
              {["en","de","fr","es","it","pt","ja","ko","zh","ru","pl"].map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-preview">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <iframe
          data-testid="iframe-bmv-vin-ssr-preview"
          src={src}
          className="flex-1 w-full bg-white"
          title="bmv.vin SSR preview"
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
}

function CrudPanel<T extends Record<string, any>>({
  cfg,
  missingLocale,
  onClearFilter,
}: {
  cfg: CrudConfig<T>;
  /** When set, only show rows whose `cfg.localeContentField[missingLocale]`
   *  is empty — i.e. the rows surfaced by clicking a red heatmap cell. */
  missingLocale?: string;
  onClearFilter?: () => void;
}) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ rows: T[] }>({ queryKey: [cfg.endpoint] });
  const [draft, setDraft] = useState<T | null>(null);
  const [previewParams, setPreviewParams] = useState<PreviewParams | null>(null);

  const save = useMutation({
    mutationFn: async (row: T) => {
      return apiRequest("POST", cfg.endpoint, row);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [cfg.endpoint] });
      toast({ title: "Saved" });
      setDraft(null);
    },
    onError: (err: any) => toast({ title: "Save failed", description: err?.message, variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `${cfg.endpoint}/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [cfg.endpoint] }); toast({ title: "Deleted" }); },
  });

  const allRows = data?.rows ?? [];
  // Apply the heatmap deep-link filter: keep only rows whose primary content
  // slot is missing for the requested locale. We use the same emptiness rule
  // as the server (see bmvVinStorage.getContentCoverage) so cell counts and
  // filtered row counts always agree.
  const isFilledForLocale = (slot: any, locale: string): boolean => {
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) return false;
    const v = slot[locale];
    if (v == null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v))      return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  };
  const rows = (missingLocale && cfg.localeContentField)
    ? allRows.filter(r => !isFilledForLocale(r[cfg.localeContentField as keyof T], missingLocale))
    : allRows;
  const editing = draft ?? null;

  function setField(field: keyof T, val: any) {
    if (!editing) return;
    setDraft({ ...editing, [field]: val });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground" data-testid="text-row-count">
          {missingLocale ? `${rows.length} of ${allRows.length} rows` : `${rows.length} rows`}
        </div>
        <Button size="sm" onClick={() => setDraft(cfg.newRow())} data-testid={`button-new-${cfg.endpoint}`}>New</Button>
      </div>
      {missingLocale && (
        <div
          className="flex items-center justify-between gap-2 rounded border border-dashed px-3 py-2 text-xs bg-muted/40"
          data-testid="banner-locale-filter"
        >
          <span>
            Showing rows missing copy for{" "}
            <span className="font-mono font-medium">{missingLocale}</span>
            {cfg.localeContentField ? <> in <span className="font-mono">{String(cfg.localeContentField)}</span></> : null}.
          </span>
          {onClearFilter && (
            <Button
              size="sm" variant="ghost"
              data-testid="button-clear-locale-filter"
              onClick={onClearFilter}
            >Clear filter</Button>
          )}
        </div>
      )}
      {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
      <div className="grid gap-2">
        {rows.map(row => {
          const previewable = cfg.previewParams ? cfg.previewParams(row) : null;
          return (
            <Card key={cfg.rowKey(row)} className="hover-elevate cursor-pointer" onClick={() => setDraft(row)}>
              <CardContent className="p-3 flex justify-between items-center">
                <div>
                  <div className="font-medium" data-testid={`row-label-${cfg.rowKey(row)}`}>{cfg.rowLabel(row)}</div>
                  <div className="text-xs text-muted-foreground">id={row.id ?? "—"}</div>
                </div>
                <div className="flex items-center gap-1">
                  {previewable && (
                    <Button
                      variant="ghost" size="icon"
                      data-testid={`button-preview-${cfg.rowKey(row)}`}
                      title="Preview SSR HTML"
                      onClick={(e) => { e.stopPropagation(); setPreviewParams(previewable); }}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  )}
                  {row.id != null && (
                    <Button
                      variant="ghost" size="icon"
                      data-testid={`button-delete-${cfg.rowKey(row)}`}
                      onClick={(e) => { e.stopPropagation(); if (confirm("Delete this row?")) del.mutate(row.id as number); }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {previewParams && <SsrPreviewModal params={previewParams} onClose={() => setPreviewParams(null)} />}
      {editing && (
        <Card>
          <CardHeader><CardTitle className="text-base">Edit row</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {cfg.fields.map(f => (
              <div key={String(f.key)}>
                <Label>{f.label}</Label>
                {f.kind === "text" ? (
                  <Input
                    data-testid={`input-${String(f.key)}`}
                    value={String(editing[f.key] ?? "")}
                    onChange={e => setField(f.key, e.target.value)}
                  />
                ) : (
                  <Textarea
                    data-testid={`json-${String(f.key)}`}
                    value={asJson(editing[f.key])}
                    onChange={e => {
                      const parsed = parseJsonOrNull(e.target.value);
                      if (parsed !== null) setField(f.key, parsed);
                      else setField(f.key, (editing as any)[f.key]); // keep last good
                    }}
                    rows={6} className="font-mono text-xs"
                  />
                )}
              </div>
            ))}
            <div className="flex gap-2">
              <Button data-testid="button-save-row" onClick={() => save.mutate(editing)} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Save
              </Button>
              <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------- Per-table configs ----------------------------------------------
const homeCfg: CrudConfig<any> = {
  endpoint: "/api/admin/bmv-vin/home",
  rowKey:   (r) => String(r.key ?? "default"),
  rowLabel: (r) => `Home (${r.key ?? "default"})`,
  newRow:   () => ({ key: "default", hero: {}, intro: {}, faq: [], metaTitle: {}, metaDescription: {} }),
  fields: [
    { key: "key",             label: "Key",              kind: "text" },
    { key: "metaTitle",       label: "Meta title (per-locale JSON)",       kind: "json" },
    { key: "metaDescription", label: "Meta description (per-locale JSON)", kind: "json" },
    { key: "hero",            label: "Hero",             kind: "json" },
    { key: "intro",           label: "Intro",            kind: "json" },
    { key: "faq",             label: "FAQ",              kind: "json" },
  ],
  previewParams: () => ({ type: "home" }),
  localeContentField: "intro",
};
const brandCfg: CrudConfig<any> = {
  endpoint: "/api/admin/bmv-vin/brand",
  rowKey:   (r) => String(r.brand),
  rowLabel: (r) => `Brand: ${r.brand}`,
  newRow:   () => ({ brand: "bmw", hero: {}, intro: {}, body: {}, faq: [], metaTitle: {}, metaDescription: {}, wmis: [] }),
  fields: [
    { key: "brand",           label: "Brand slug",        kind: "text" },
    { key: "metaTitle",       label: "Meta title (JSON)", kind: "json" },
    { key: "metaDescription", label: "Meta desc (JSON)",  kind: "json" },
    { key: "hero",            label: "Hero",              kind: "json" },
    { key: "intro",           label: "Intro",             kind: "json" },
    { key: "body",            label: "Body markdown",     kind: "json" },
    { key: "faq",             label: "FAQ",               kind: "json" },
    { key: "wmis",            label: "WMIs",              kind: "json" },
  ],
  previewParams: (r) => r.brand ? { type: "brand", kind: String(r.brand) } : null,
  localeContentField: "intro",
};
const facetCfg: CrudConfig<any> = {
  endpoint: "/api/admin/bmv-vin/facet",
  rowKey:   (r) => `${r.facetKind}/${r.facetValue}`,
  rowLabel: (r) => `${r.facetKind} / ${r.facetValue}`,
  newRow:   () => ({ facetKind: "chassis", facetValue: "", blurb: {}, faq: [], metaTitle: {}, metaDescription: {} }),
  fields: [
    { key: "facetKind",       label: "Facet kind",                    kind: "text" },
    { key: "facetValue",      label: "Facet value",                   kind: "text" },
    { key: "metaTitle",       label: "Meta title (JSON)",             kind: "json" },
    { key: "metaDescription", label: "Meta description (JSON)",       kind: "json" },
    { key: "blurb",           label: "Blurb (per-locale)",            kind: "json" },
    { key: "faq",             label: "FAQ",                           kind: "json" },
  ],
  previewParams: (r) => (r.facetKind && r.facetValue)
    ? { type: "facet", kind: String(r.facetKind), value: String(r.facetValue) }
    : null,
  localeContentField: "blurb",
};
const guideCfg: CrudConfig<any> = {
  endpoint: "/api/admin/bmv-vin/guides",
  rowKey:   (r) => String(r.slug),
  rowLabel: (r) => String(r.slug),
  newRow:   () => ({ slug: "", schemaType: "Article", category: "reference", title: {}, summary: {}, body: {}, faq: [], metaTitle: {}, metaDescription: {}, steps: [], relatedSlugs: [] }),
  fields: [
    { key: "slug",            label: "Slug",                   kind: "text" },
    { key: "schemaType",      label: "Schema type (Article/HowTo)", kind: "text" },
    { key: "category",        label: "Category",               kind: "text" },
    { key: "title",           label: "Title (per-locale JSON)", kind: "json" },
    { key: "summary",         label: "Summary",                kind: "json" },
    { key: "body",            label: "Body markdown",          kind: "json" },
    { key: "faq",             label: "FAQ",                    kind: "json" },
    { key: "steps",           label: "HowTo steps",            kind: "json" },
    { key: "relatedSlugs",    label: "Related slugs",          kind: "json" },
  ],
  previewParams: (r) => r.slug ? { type: "guide", value: String(r.slug) } : null,
  localeContentField: "body",
};
const glossaryCfg: CrudConfig<any> = {
  endpoint: "/api/admin/bmv-vin/glossary",
  rowKey:   (r) => String(r.term),
  rowLabel: (r) => `${r.term}${r.termSet ? ` (${r.termSet})` : ""}`,
  newRow:   () => ({ term: "", termSet: "", display: {}, definition: {}, longForm: {}, metaTitle: {}, metaDescription: {}, relatedTerms: [] }),
  fields: [
    { key: "term",            label: "Term (slug)",          kind: "text" },
    { key: "termSet",         label: "Term set",             kind: "text" },
    { key: "display",         label: "Display (JSON)",       kind: "json" },
    { key: "definition",      label: "Definition (JSON)",    kind: "json" },
    { key: "longForm",        label: "Long form (JSON)",     kind: "json" },
    { key: "relatedTerms",    label: "Related terms",        kind: "json" },
  ],
  previewParams: (r) => r.term ? { type: "glossary", value: String(r.term) } : null,
  localeContentField: "definition",
};

// ---------- Top-level panel -------------------------------------------------
export function BmvVinContentPanel() {
  // Tab + heatmap-driven filter are lifted here so clicking a heatmap cell
  // can jump to the matching tab and pre-narrow the row list to "missing
  // copy in <locale>".
  const [tab, setTab] = useState<string>("home");
  const [missingFor, setMissingFor] = useState<{ tab: string; locale: string } | null>(null);

  const handleHeatmapClick = (pt: ContentPageType, locale: string) => {
    const target = PAGE_TYPE_TO_TAB[pt];
    setTab(target);
    setMissingFor({ tab: target, locale });
  };
  const clearFilter = () => setMissingFor(null);
  // Show the filter only on the tab the user clicked from the heatmap. If
  // they switch away to another tab manually, that tab gets the unfiltered
  // view — much less surprising than carrying the filter across tabs.
  const localeFor = (t: string) => (missingFor && missingFor.tab === t ? missingFor.locale : undefined);

  return (
    <div className="space-y-4" data-testid="panel-bmv-vin-content">
      <CoverageTile onCellClick={handleHeatmapClick} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="home">Home</TabsTrigger>
          <TabsTrigger value="brand">Brand</TabsTrigger>
          <TabsTrigger value="facet">Facets</TabsTrigger>
          <TabsTrigger value="guides">Guides</TabsTrigger>
          <TabsTrigger value="glossary">Glossary</TabsTrigger>
        </TabsList>
        <TabsContent value="home">
          <CrudPanel cfg={homeCfg}     missingLocale={localeFor("home")}     onClearFilter={clearFilter} />
        </TabsContent>
        <TabsContent value="brand">
          <CrudPanel cfg={brandCfg}    missingLocale={localeFor("brand")}    onClearFilter={clearFilter} />
        </TabsContent>
        <TabsContent value="facet">
          <CrudPanel cfg={facetCfg}    missingLocale={localeFor("facet")}    onClearFilter={clearFilter} />
        </TabsContent>
        <TabsContent value="guides">
          <CrudPanel cfg={guideCfg}    missingLocale={localeFor("guides")}   onClearFilter={clearFilter} />
        </TabsContent>
        <TabsContent value="glossary">
          <CrudPanel cfg={glossaryCfg} missingLocale={localeFor("glossary")} onClearFilter={clearFilter} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
