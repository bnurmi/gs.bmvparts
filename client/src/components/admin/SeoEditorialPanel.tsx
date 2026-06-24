import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Save, FileWarning, Sparkles, Languages } from "lucide-react";
import { CLIENT_LOCALES } from "@/lib/locale";

// Server stores `en` for the English default; non-English codes are full
// BCP-47 (`de-DE`, `zh-CN`, …). The admin panel uses the same set, mirroring
// shared/i18n/types.ts SUPPORTED_LOCALES so the dropdown stays in sync.
const ADMIN_LOCALE_OPTIONS: { value: string; label: string }[] = CLIENT_LOCALES.map(l => ({
  value: l.code === "en" ? "en" : l.code,
  label: `${l.nativeLabel} (${l.code})`,
}));

interface CategoryEditorial {
  id: number;
  categoryKey: string;
  subcategoryKey: string | null;
  blurb: string;
  locale: string;
  updatedAt: string;
}

interface PartNote {
  id: number;
  partNumberClean: string;
  note: string;
  locale: string;
  updatedAt: string;
}

interface HubEditorial {
  id: number;
  hubType: "chassis" | "series";
  hubKey: string;
  blurb: string;
  updatedAt: string;
}

interface LanguageStatsRow {
  locale: string;
  nativeLabel: string;
  prefix: string;
  hits: number;
}

interface SeoHealth {
  partNotes: number;
  categoryBlurbs: number;
  totalDistinctParts: number;
  thinSamples: { partNumberClean: string; fitmentCount: number; description: string }[];
  buckets: { thin: number; standard: number; enriched: number };
  recentNotes: PartNote[];
}

interface SeoPreview {
  partNumber: string;
  partNumberClean: string;
  richness: "thin" | "standard" | "enriched";
  content: {
    intro: string;
    fitmentSummary: string;
    metaTitle: string;
    metaDescription: string;
    specs: { label: string; value: string }[];
    faq: { question: string; answer: string }[];
  };
}

export default function SeoEditorialPanel() {
  const { toast } = useToast();
  const [catKey, setCatKey] = useState("");
  const [subKey, setSubKey] = useState("");
  const [blurb, setBlurb] = useState("");
  const [partNum, setPartNum] = useState("");
  const [note, setNote] = useState("");
  const [previewPart, setPreviewPart] = useState("");
  const [preview, setPreview] = useState<SeoPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  // Active locale for editing AND preview. `en` is the default that has
  // always existed; other locales fall back to English content if no
  // translated row exists yet.
  const [activeLocale, setActiveLocale] = useState<string>("en");

  const loadPreview = async () => {
    if (!previewPart) return;
    setPreviewLoading(true); setPreviewError(null);
    try {
      const res = await fetch(
        `/api/admin/seo/preview/${encodeURIComponent(previewPart.replace(/[\s\-]+/g, ""))}?locale=${encodeURIComponent(activeLocale)}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        setPreviewError(res.status === 404 ? "Part not found" : `Error ${res.status}`);
        setPreview(null);
      } else {
        setPreview(await res.json());
      }
    } catch (e: any) {
      setPreviewError(e.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const health = useQuery<SeoHealth>({ queryKey: ["/api/admin/seo/health"] });
  const cats = useQuery<CategoryEditorial[]>({ queryKey: ["/api/admin/seo/category-editorial"] });
  const notes = useQuery<PartNote[]>({ queryKey: ["/api/admin/seo/part-notes"] });
  const hubs = useQuery<HubEditorial[]>({ queryKey: ["/api/admin/seo/hub-editorial"] });
  // Per-locale request counters from /api/parts/seo. Drives the editor's
  // priority list — translate the languages with the most traffic first.
  const langStats = useQuery<{ days: number; rows: LanguageStatsRow[] }>({
    queryKey: ["/api/admin/seo/language-stats"],
  });

  const [hubType, setHubType] = useState<"chassis" | "series">("chassis");
  const [hubKey, setHubKey] = useState("");
  const [hubBlurb, setHubBlurb] = useState("");

  const saveHub = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/admin/seo/hub-editorial", { hubType, hubKey, blurb: hubBlurb }),
    onSuccess: () => {
      toast({ title: "Saved", description: "Hub blurb updated" });
      setHubKey(""); setHubBlurb("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/hub-editorial"] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  const deleteHub = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/seo/hub-editorial/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/hub-editorial"] }),
  });

  const saveCat = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/seo/category-editorial", {
        categoryKey: catKey,
        subcategoryKey: subKey || null,
        blurb,
        locale: activeLocale,
      });
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Category blurb updated" });
      setBlurb(""); setSubKey(""); setCatKey("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/category-editorial"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/health"] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  const deleteCat = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/seo/category-editorial/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/category-editorial"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/health"] });
    },
  });
  const saveNote = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/admin/seo/part-notes", { partNumberClean: partNum, note, locale: activeLocale }),
    onSuccess: () => {
      toast({ title: "Saved", description: "Part editorial note updated" });
      setPartNum(""); setNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/part-notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/health"] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  const deleteNote = useMutation({
    mutationFn: async ({ pn, locale }: { pn: string; locale: string }) =>
      apiRequest("DELETE", `/api/admin/seo/part-notes/${encodeURIComponent(pn)}?locale=${encodeURIComponent(locale)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/part-notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/health"] });
    },
  });

  return (
    <div className="space-y-8">
      <section
        className="flex items-center justify-between gap-3 border rounded-lg p-3 bg-muted/30"
        data-testid="section-locale-switcher"
      >
        <div className="flex items-center gap-2">
          <Languages className="w-4 h-4 text-muted-foreground" />
          <Label htmlFor="locale-select" className="text-sm">Editing language</Label>
          <select
            id="locale-select"
            value={activeLocale}
            onChange={e => setActiveLocale(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm bg-background"
            data-testid="select-active-locale"
          >
            {ADMIN_LOCALE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          Saves and preview run against this locale. Missing translations fall back to English at request time.
        </p>
      </section>

      <section data-testid="section-language-stats">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Languages className="w-4 h-4" /> Language demand (last {langStats.data?.days ?? 30} days)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(langStats.data?.rows || []).map(r => (
            <button
              key={r.locale}
              onClick={() => setActiveLocale(r.locale)}
              className={`text-left border rounded-md p-2 hover:bg-accent ${activeLocale === r.locale ? "border-primary" : ""}`}
              data-testid={`lang-stat-${r.locale}`}
            >
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{r.locale}</div>
              <div className="text-sm font-medium">{r.nativeLabel}</div>
              <div className="text-lg font-semibold tabular-nums" data-testid={`lang-hits-${r.locale}`}>
                {r.hits.toLocaleString()}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section data-testid="section-seo-health">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> SEO content health
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Distinct parts</div>
            <div className="text-2xl font-semibold" data-testid="stat-total-parts">{health.data?.totalDistinctParts ?? "—"}</div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Editor part notes</div>
            <div className="text-2xl font-semibold" data-testid="stat-part-notes">{health.data?.partNotes ?? "—"}</div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Category blurbs</div>
            <div className="text-2xl font-semibold" data-testid="stat-category-blurbs">{health.data?.categoryBlurbs ?? "—"}</div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Thin pages (sample)</div>
            <div className="text-2xl font-semibold" data-testid="stat-thin-samples">{health.data?.thinSamples?.length ?? "—"}</div>
          </div>
        </div>

        {health.data?.buckets && (
          <div className="mt-3 grid grid-cols-3 gap-3" data-testid="seo-buckets">
            <div className="border rounded-lg p-3 border-rose-300 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-950/20">
              <div className="text-xs uppercase tracking-wide text-rose-700 dark:text-rose-300">Thin</div>
              <div className="text-2xl font-semibold" data-testid="bucket-thin">{health.data.buckets.thin.toLocaleString()}</div>
              <div className="text-[11px] text-muted-foreground">≤1 confirmed fitment, no editor note</div>
            </div>
            <div className="border rounded-lg p-3 border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20">
              <div className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">Standard</div>
              <div className="text-2xl font-semibold" data-testid="bucket-standard">{health.data.buckets.standard.toLocaleString()}</div>
              <div className="text-[11px] text-muted-foreground">2–4 fitments, no editor note</div>
            </div>
            <div className="border rounded-lg p-3 border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20">
              <div className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Enriched</div>
              <div className="text-2xl font-semibold" data-testid="bucket-enriched">{health.data.buckets.enriched.toLocaleString()}</div>
              <div className="text-[11px] text-muted-foreground">≥5 fitments, or has editor note</div>
            </div>
          </div>
        )}

        <div className="mt-4 border rounded-lg p-3" data-testid="section-preview">
          <div className="flex items-end gap-2 mb-2">
            <div className="flex-1">
              <Label>Preview generated copy for a part</Label>
              <Input
                value={previewPart}
                onChange={e => setPreviewPart(e.target.value)}
                placeholder="11427826799"
                className="font-mono"
                data-testid="input-preview-part"
              />
            </div>
            <Button
              onClick={loadPreview}
              disabled={!previewPart || previewLoading}
              data-testid="button-load-preview"
            >
              {previewLoading ? "Loading…" : "Preview"}
            </Button>
          </div>
          {previewError && (
            <p className="text-sm text-destructive" data-testid="text-preview-error">{previewError}</p>
          )}
          {preview && (
            <div className="space-y-2 text-sm" data-testid="preview-output">
              <div>
                <Badge
                  variant="outline"
                  className={
                    preview.richness === "enriched"
                      ? "border-emerald-500 text-emerald-700 dark:text-emerald-300"
                      : preview.richness === "standard"
                      ? "border-amber-500 text-amber-700 dark:text-amber-300"
                      : "border-rose-500 text-rose-700 dark:text-rose-300"
                  }
                  data-testid="badge-preview-richness"
                >
                  {preview.richness}
                </Badge>
                <span className="ml-2 font-mono text-xs">{preview.partNumber}</span>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Meta title</div>
                <div className="font-medium" data-testid="text-preview-meta-title">{preview.content.metaTitle}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Meta description</div>
                <div className="text-muted-foreground" data-testid="text-preview-meta-desc">{preview.content.metaDescription}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Intro</div>
                <p className="leading-relaxed" data-testid="text-preview-intro">{preview.content.intro}</p>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">FAQ ({preview.content.faq.length})</div>
                <ul className="text-xs list-disc pl-5 space-y-0.5">
                  {preview.content.faq.map((f, i) => <li key={i}>{f.question}</li>)}
                </ul>
              </div>
            </div>
          )}
        </div>
        {health.data?.thinSamples && health.data.thinSamples.length > 0 && (
          <div className="mt-3 border rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <FileWarning className="w-4 h-4 text-amber-600" />
              Thin pages — parts with ≤1 confirmed fitment (worth enriching with editor notes)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1 max-h-64 overflow-auto">
              {health.data.thinSamples.map(s => (
                <button
                  key={s.partNumberClean}
                  onClick={() => setPartNum(s.partNumberClean)}
                  className="text-left text-xs border rounded px-2 py-1 hover:bg-accent"
                  data-testid={`thin-${s.partNumberClean}`}
                >
                  <span className="font-mono font-semibold">{s.partNumberClean}</span>
                  <span className="text-muted-foreground"> — {s.description}</span>
                  <Badge variant="outline" className="ml-1 text-[10px]">{s.fitmentCount} fit</Badge>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section id="seo-category-editorial" data-testid="section-category-editorial">
        <h2 className="text-lg font-semibold mb-3">Category buying-guide blurbs</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Long-form copy shown on part pages within this category. Match by exact <code>categoryName</code> (and optionally <code>subcategoryName</code>) from the catalog.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <Label>Category name</Label>
            <Input value={catKey} onChange={e => setCatKey(e.target.value)} placeholder="Engine" data-testid="input-cat-key" />
          </div>
          <div>
            <Label>Subcategory (optional)</Label>
            <Input value={subKey} onChange={e => setSubKey(e.target.value)} placeholder="Lubrication system - Oil filter" data-testid="input-sub-key" />
          </div>
        </div>
        <Label>Blurb</Label>
        <textarea
          value={blurb}
          onChange={e => setBlurb(e.target.value)}
          rows={5}
          className="w-full border rounded-md p-2 text-sm bg-background"
          placeholder="Short SEO-friendly buying guide for this category…"
          data-testid="textarea-cat-blurb"
        />
        <Button
          className="mt-2"
          disabled={!catKey || !blurb || saveCat.isPending}
          onClick={() => saveCat.mutate()}
          data-testid="button-save-cat-blurb"
        >
          <Save className="w-4 h-4 mr-1.5" /> Save blurb
        </Button>

        <div className="mt-4 space-y-2">
          {(cats.data || []).map(c => (
            <div key={c.id} className="border rounded-lg p-3 text-sm" data-testid={`cat-row-${c.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    <span>{c.categoryKey}{c.subcategoryKey ? ` › ${c.subcategoryKey}` : ""}</span>
                    <Badge variant="outline" className="text-[10px]" data-testid={`cat-locale-${c.id}`}>{c.locale || "en"}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-pre-line mt-1">{c.blurb}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => deleteCat.mutate(c.id)} data-testid={`button-delete-cat-${c.id}`}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="seo-hub-editorial" data-testid="section-hub-editorial">
        <h2 className="text-lg font-semibold mb-3">Chassis & series hub blurbs</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Long-form intro shown above the model list on <code>/chassis/:code</code> and <code>/series/:slug</code> hub pages. Use the chassis code (e.g. <code>G87</code>) or the series slug (e.g. <code>3-series</code>).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
          <div>
            <Label>Hub type</Label>
            <select
              className="w-full border rounded-md p-2 text-sm bg-background"
              value={hubType}
              onChange={e => setHubType(e.target.value as "chassis" | "series")}
              data-testid="select-hub-type"
            >
              <option value="chassis">Chassis</option>
              <option value="series">Series</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>{hubType === "chassis" ? "Chassis code" : "Series slug"}</Label>
            <Input
              value={hubKey}
              onChange={e => setHubKey(e.target.value)}
              placeholder={hubType === "chassis" ? "G87" : "3-series"}
              className="font-mono"
              data-testid="input-hub-key"
            />
          </div>
        </div>
        <Label>Blurb</Label>
        <textarea
          value={hubBlurb}
          onChange={e => setHubBlurb(e.target.value)}
          rows={5}
          className="w-full border rounded-md p-2 text-sm bg-background"
          placeholder="One- or two-paragraph intro for this hub page (buying guide, generation context, common parts to look at)…"
          data-testid="textarea-hub-blurb"
        />
        <Button
          className="mt-2"
          disabled={!hubKey || !hubBlurb || saveHub.isPending}
          onClick={() => saveHub.mutate()}
          data-testid="button-save-hub-blurb"
        >
          <Save className="w-4 h-4 mr-1.5" /> Save blurb
        </Button>

        <div className="mt-4 space-y-2">
          {(hubs.data || []).map(h => (
            <div key={h.id} className="border rounded-lg p-3 text-sm" data-testid={`hub-row-${h.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">
                    <Badge variant="outline" className="mr-1.5 text-[10px] uppercase">{h.hubType}</Badge>
                    <span className="font-mono">{h.hubKey}</span>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-pre-line mt-1">{h.blurb}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => deleteHub.mutate(h.id)} data-testid={`button-delete-hub-${h.id}`}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="seo-part-notes" data-testid="section-part-notes">
        <h2 className="text-lg font-semibold mb-3">Per-part editorial notes</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Optional one-paragraph note that overrides/augments generated copy for a specific part number. Uses the cleaned (no-spaces) part number.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
          <div>
            <Label>Part number (clean)</Label>
            <Input
              value={partNum}
              onChange={e => setPartNum(e.target.value.replace(/[\s\-]+/g, ""))}
              placeholder="11427826799"
              className="font-mono"
              data-testid="input-part-num"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Note</Label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Editorial note shown on the part page" data-testid="input-note" />
          </div>
        </div>
        <Button
          disabled={!partNum || !note || saveNote.isPending}
          onClick={() => saveNote.mutate()}
          data-testid="button-save-note"
        >
          <Save className="w-4 h-4 mr-1.5" /> Save note
        </Button>

        <div className="mt-4 space-y-2 max-h-96 overflow-auto">
          {(notes.data || []).map(n => (
            <div key={n.id} className="border rounded-lg p-2.5 text-sm flex items-start justify-between gap-2" data-testid={`note-row-${n.partNumberClean}`}>
              <div>
                <div className="font-mono text-xs font-semibold flex items-center gap-2">
                  <span>{n.partNumberClean}</span>
                  <Badge variant="outline" className="text-[10px]" data-testid={`note-locale-${n.partNumberClean}`}>{n.locale || "en"}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">{n.note}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => deleteNote.mutate({ pn: n.partNumberClean, locale: n.locale || "en" })} data-testid={`button-delete-note-${n.partNumberClean}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
