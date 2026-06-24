// Shared body for the Quick Servicing Info surface (Task #106).
// Renders fluids + filters with per-field trust badges. Used by both
// /servicing[:vin] (top-level page) and the Servicing tab on the VIN
// Decoder. The component fetches its own data when given a VIN; it can
// also be rendered without one to show the empty-state lookup form.

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocalizedHref } from "@/lib/locale";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useT, EN } from "@/lib/i18n";
import {
  AlertTriangle, CheckCircle2, Sparkles, Search, Droplets, Filter as FilterIcon, Loader2, Mail, Pin,
} from "lucide-react";

export interface ServicingFluid {
  key: string;
  value: {
    capacityMl: number | null;
    grade: string | null;
    notes: string | null;
    status: "verified" | "ai_draft" | "empty";
    verifiedBy: string | null;
    verifiedAt: string | null;
  };
}

export interface ServicingFilter {
  filterKey: string;
  partNumber: string | null;
  note: string | null;
  status: "verified" | "ai_draft" | "empty";
  verifiedBy: string | null;
  verifiedAt: string | null;
  source: "admin_pin" | "catalog_match" | "none";
  catalogDescription?: string | null;
}

export interface ServicingPayload {
  vin: string | null;
  chassis: string | null;
  engine: string | null;
  modelName: string | null;
  modelYear: number | null;
  fluids: ServicingFluid[];
  filters: ServicingFilter[];
  hasAnyAiDraft: boolean;
  hasAnyData: boolean;
  decodeError?: string | null;
}

// Filters/fluids that don't apply to every BMW configuration. We only render
// these when there's actual data (verified, ai_draft, or auto-derived). For
// example: front diff applies to xDrive only; transfer case applies to
// xDrive only; fuel filter is mostly diesels; transmission filter applies
// to specific gearboxes.
const OPTIONAL_FLUID_KEYS = new Set(["frontDiff", "transferCase"]);
const OPTIONAL_FILTER_KEYS = new Set(["fuel", "transmission"]);

const FLUID_LABELS: Record<string, string> = {
  engineOil: "Engine oil",
  gearbox: "Gearbox / transmission",
  frontDiff: "Front differential",
  rearDiff: "Rear differential",
  transferCase: "Transfer case",
  cooling: "Cooling system",
};

const FILTER_LABELS: Record<string, string> = {
  engine_oil: "Engine oil filter",
  cabin: "Cabin / micro filter",
  air: "Air filter",
  fuel: "Fuel filter",
  transmission: "Transmission filter",
};

function formatMl(ml: number | null): string | null {
  if (ml == null) return null;
  if (ml >= 1000) return `${(ml / 1000).toFixed(1)} L`;
  return `${ml} ml`;
}

function useServicingT() {
  const t = useT();
  return t.servicing ?? EN.servicing!;
}

function TrustBadge({ status }: { status: "verified" | "ai_draft" | "empty" }) {
  const s = useServicingT();
  if (status === "verified") {
    return (
      <Badge variant="default" className="bg-green-600 text-white text-[10px] gap-1" data-testid="badge-verified">
        <CheckCircle2 className="w-3 h-3" /> {s.verifiedBadge}
      </Badge>
    );
  }
  if (status === "ai_draft") {
    return (
      <Badge variant="outline" className="text-amber-700 dark:text-amber-400 border-amber-300 text-[10px] gap-1" data-testid="badge-ai-draft">
        <Sparkles className="w-3 h-3" /> {s.aiDraftBadge}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground text-[10px]" data-testid="badge-empty">
      {s.noDataBadge}
    </Badge>
  );
}

function FluidCard({ entry }: { entry: ServicingFluid }) {
  const s = useServicingT();
  const v = entry.value;
  const empty = v.status === "empty";
  return (
    <div className="border rounded-md p-3 space-y-2" data-testid={`fluid-card-${entry.key}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm">{FLUID_LABELS[entry.key] ?? entry.key}</div>
        <TrustBadge status={v.status} />
      </div>
      {empty ? (
        <div className="text-xs text-muted-foreground italic">{s.notDocumented}</div>
      ) : (
        <div className="space-y-1 text-sm">
          {v.capacityMl != null && (
            <div data-testid={`fluid-capacity-${entry.key}`}>
              <span className="text-muted-foreground text-xs mr-1">{s.capacityLabel ?? "Capacity"}:</span>
              <span className="font-mono">{formatMl(v.capacityMl)}</span>
            </div>
          )}
          {v.grade && (
            <div data-testid={`fluid-grade-${entry.key}`}>
              <span className="text-muted-foreground text-xs mr-1">{s.gradeLabel ?? "Grade"}:</span>
              <span>{v.grade}</span>
            </div>
          )}
          {v.notes && (
            <div className="text-xs text-muted-foreground" data-testid={`fluid-notes-${entry.key}`}>
              {v.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterCard({ entry }: { entry: ServicingFilter }) {
  const s = useServicingT();
  const localize = useLocalizedHref();
  const empty = entry.status === "empty" || !entry.partNumber;
  return (
    <div className="border rounded-md p-3 space-y-2" data-testid={`filter-card-${entry.filterKey}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm">{FILTER_LABELS[entry.filterKey] ?? entry.filterKey}</div>
        <TrustBadge status={entry.status} />
      </div>
      {empty ? (
        <div className="text-xs text-muted-foreground italic">{s.noPartNumber}</div>
      ) : (
        <div className="space-y-1 text-sm">
          <div data-testid={`filter-partnumber-${entry.filterKey}`}>
            <span className="text-muted-foreground text-xs mr-1">Part #:</span>
            <Link
              href={localize(`/part/${entry.partNumber!.replace(/[^A-Za-z0-9]/g, "")}`)}
              className="font-mono text-primary hover:underline"
              data-testid={`link-filter-part-${entry.filterKey}`}
            >
              {entry.partNumber}
            </Link>
          </div>
          {entry.note && (
            <div className="text-xs text-muted-foreground" data-testid={`filter-note-${entry.filterKey}`}>
              {entry.note}
            </div>
          )}
          {entry.source === "admin_pin" && (
            <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1" data-testid={`filter-source-pin-${entry.filterKey}`}>
              <Pin className="w-3 h-3" /> {s.pinnedByAdmin}
            </div>
          )}
          {entry.source === "catalog_match" && entry.catalogDescription && (
            <div className="text-[11px] text-muted-foreground italic" data-testid={`filter-source-auto-${entry.filterKey}`}>
              {s.autoDerived}: “{entry.catalogDescription}”
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  vin?: string | null;
  hideHeader?: boolean;
  onVinSubmit?: (vin: string) => void;
}

export default function ServicingBody({ vin, hideHeader, onVinSubmit }: Props) {
  const localize = useLocalizedHref();
  const { toast } = useToast();
  const s = useServicingT();
  const [vinInput, setVinInput] = useState("");
  const [coverageEmail, setCoverageEmail] = useState("");

  const enabled = !!vin && vin.length === 17;
  const query = useQuery<ServicingPayload>({
    queryKey: ["/api/servicing", vin ?? ""],
    enabled,
  });

  const coverageMutation = useMutation({
    mutationFn: async () => {
      if (!query.data?.chassis || !query.data?.engine) {
        throw new Error("Chassis and engine must be known to request coverage.");
      }
      await apiRequest("POST", "/api/servicing/coverage-request", {
        chassis: query.data.chassis,
        engine: query.data.engine,
        vin: query.data.vin ?? null,
        email: coverageEmail.trim() || null,
      });
    },
    onSuccess: () => {
      toast({ title: s.coverageRequestedToast ?? "Coverage requested", description: s.coverageRequestedBody ?? "We'll prioritize this chassis + engine." });
      setCoverageEmail("");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : (s.coverageErrorBody ?? "Try again later.");
      toast({ title: s.coverageErrorToast ?? "Could not record request", description: msg, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4" data-testid="servicing-body">
      {!hideHeader && (
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-servicing-title">
            <Droplets className="w-5 h-5" /> {s.title}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{s.subtitle}</p>
        </div>
      )}

      {!vin && (
        <div className="border rounded-lg p-4 space-y-2" data-testid="servicing-vin-input">
          <div className="text-sm font-medium">{s.lookupHeading}</div>
          <div className="flex gap-2">
            <Input
              placeholder={s.lookupPlaceholder}
              value={vinInput}
              onChange={e => setVinInput(e.target.value.toUpperCase())}
              maxLength={17}
              className="font-mono uppercase"
              data-testid="input-servicing-vin"
            />
            <Button
              onClick={() => {
                const cleaned = vinInput.trim().toUpperCase();
                if (cleaned.length === 17 && onVinSubmit) onVinSubmit(cleaned);
              }}
              disabled={vinInput.trim().length !== 17}
              data-testid="button-servicing-lookup"
            >
              <Search className="w-4 h-4 mr-1" /> {s.lookupButton}
            </Button>
          </div>
        </div>
      )}

      {enabled && query.isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
        </div>
      )}

      {enabled && query.isError && (
        <div className="border border-destructive/30 bg-destructive/5 rounded-md p-3 flex items-start gap-2 text-sm" data-testid="servicing-error">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
          <div>
            <div className="font-medium">{s.loadErrorTitle ?? "Couldn't load servicing info"}</div>
            <div className="text-xs text-muted-foreground">{(query.error as Error)?.message}</div>
          </div>
        </div>
      )}

      {query.data && (
        <>
          <div className="border rounded-md p-3 bg-muted/20 text-sm" data-testid="servicing-vehicle-summary">
            <div className="flex items-center gap-2 flex-wrap">
              {query.data.vin && (
                <span className="font-mono text-xs tracking-wider" data-testid="text-servicing-vin">{query.data.vin}</span>
              )}
              {query.data.chassis && <Badge variant="secondary" data-testid="badge-chassis">{query.data.chassis}</Badge>}
              {query.data.engine && <Badge variant="outline" data-testid="badge-engine">Engine {query.data.engine}</Badge>}
              {query.data.modelYear && <Badge variant="outline" data-testid="badge-model-year">{query.data.modelYear}</Badge>}
              {query.data.modelName && <span className="text-muted-foreground" data-testid="text-model-name">{query.data.modelName}</span>}
            </div>
            {query.data.decodeError && (
              <div className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                {query.data.decodeError}
              </div>
            )}
          </div>

          {query.data.hasAnyAiDraft && (
            <div className="border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 rounded-md p-3 flex items-start gap-2 text-sm" data-testid="ai-draft-banner">
              <Sparkles className="w-4 h-4 text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-amber-900 dark:text-amber-200">{s.aiBannerTitle}</div>
                <div className="text-xs text-amber-800 dark:text-amber-300/80 mt-0.5">{s.aiBannerBody}</div>
              </div>
            </div>
          )}

          {query.data.chassis && query.data.engine ? (
            <>
              <section className="space-y-2" data-testid="section-fluids">
                <div className="flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-muted-foreground" />
                  <h2 className="font-semibold text-sm">{s.fluidsHeader}</h2>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {query.data.fluids
                    .filter(f => !(OPTIONAL_FLUID_KEYS.has(f.key) && f.value.status === "empty"))
                    .map(f => <FluidCard key={f.key} entry={f} />)}
                </div>
              </section>

              <section className="space-y-2" data-testid="section-filters">
                <div className="flex items-center gap-2">
                  <FilterIcon className="w-4 h-4 text-muted-foreground" />
                  <h2 className="font-semibold text-sm">{s.filtersHeader}</h2>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {query.data.filters
                    .filter(f => !(OPTIONAL_FILTER_KEYS.has(f.filterKey) && (f.status === "empty" || !f.partNumber)))
                    .map(f => <FilterCard key={f.filterKey} entry={f} />)}
                </div>
              </section>

              {!query.data.hasAnyData && (
                <div className="border rounded-md p-3 space-y-2 bg-muted/20" data-testid="coverage-request-block">
                  <div className="text-sm font-medium">{s.coverageHeading} — {query.data.chassis} / {query.data.engine}</div>
                  <p className="text-xs text-muted-foreground">{s.coverageBody}</p>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={coverageEmail}
                      onChange={e => setCoverageEmail(e.target.value)}
                      className="text-sm h-8"
                      data-testid="input-coverage-email"
                    />
                    <Button
                      size="sm"
                      onClick={() => coverageMutation.mutate()}
                      disabled={coverageMutation.isPending}
                      data-testid="button-coverage-request"
                    >
                      {coverageMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Mail className="w-4 h-4 mr-1" /> {s.coverageButton}</>}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="border rounded-md p-3 text-sm text-muted-foreground" data-testid="servicing-no-key">
              {s.noKeyHint ?? "We could not determine the chassis + engine for this VIN, so servicing info isn't available."}
              {" "}
              <Link href={localize(`/vin/${query.data.vin ?? ""}`)} className="text-primary hover:underline">
                {s.openInVinDecoder ?? "Open in VIN decoder"}
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
