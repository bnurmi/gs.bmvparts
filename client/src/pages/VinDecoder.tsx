import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { CLIENT_LOCALES, useLocalizedHref, withLocalePrefix, splitLocaleFromPath } from "@/lib/locale";
import { trackedHref } from "@/lib/tracked-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Search, Car as CarIcon, Factory, Calendar, Cpu, Gauge, Shield,
  ChevronRight, Package2, Tag, Info, AlertTriangle, CheckCircle2,
  Hash, MapPin, Cog, Zap, ExternalLink, Copy, Check,
  Settings2, Image, FileText, Palette, Armchair, Globe, BookOpen, Download, Loader2, Link2,
  Bookmark, Droplets
} from "lucide-react";
import ServicingBody from "@/components/ServicingBody";
import { AiFaqSection } from "@/components/AiFaqSection";

function isBmvVinHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return h === "bmv.vin" || h === "www.bmv.vin";
}

interface PlantInfo { code: string; city: string; country: string; }

interface NhtsaData {
  make: string | null; model: string | null; modelYear: string | null;
  bodyClass: string | null; vehicleType: string | null;
  plantCity: string | null; plantCountry: string | null;
  series: string | null; trim: string | null; driveType: string | null;
  engineBrakeHp: string | null; doors: string | null;
  abs: string | null; esc: string | null;
  tractionControl: string | null; tpms: string | null;
  allFields: Record<string, string>;
}

interface VinDecodeResult {
  vin: string; last7: string; isValid: boolean; validationErrors: string[];
  manufacturer: string | null; division: string | null;
  modelYear: number | null; plant: PlantInfo | null;
  chassis: string | null; series: string | null; generation: string | null;
  bodyType: string | null; modelName: string | null;
  engine: string | null; engineFamily: string | null;
  driveType: string | null; productionSequence: string | null;
  isBmw: boolean; wmi: string; vds: string; vis: string;
  typeCode: string | null;
  typeCodeSource: "vds_pattern" | "bmw_models" | "bmw_models_prefix" | null;
  dataFreshness?: "fresh" | "stale" | "unknown";
  nhtsaData: NhtsaData | null;
}

interface CatalogMatch {
  id: number; chassis: string; generation: string; modelName: string;
  engine: string; bodyType: string; slug: string; totalParts: number;
  typeCode?: string | null;
  categories: { id: number; name: string }[];
}

type DecodeStatus =
  | "matched"
  | "enriching"
  | "no_chassis_carried"
  | "valid_but_unknown"
  | "invalid_vin"
  | "not_bmw"
  | "chassis_resolved_no_local_parts";

interface RealoemFallbackInfo {
  attempted: boolean;
  status: string;
  chassis: string | null;
  fromCache: boolean;
}

interface DecodeResponse {
  decoded: VinDecodeResult;
  matchedCars: CatalogMatch[];
  totalCatalogMatches: number;
  decodeStatus?: DecodeStatus;
  siblings?: CatalogMatch[];
  knownChassis?: string | null;
  realoemFallback?: RealoemFallbackInfo | null;
}

interface BwVehicle {
  vin: string; codeType: string | null; chassis: string | null;
  market: string | null; engine: string | null; drivetrain: string | null;
  transmission: string | null; color: string | null; colorCode: string | null;
  upholstery: string | null; upholsteryCode: string | null;
  startOfProduction: string | null; manufacturer: string | null;
  modelName: string | null;
}

interface BwOption {
  code: string; nameEn: string; nameDe: string; imageUrl: string | null;
}

interface BwImages {
  exteriorUrl: string | null; interiorUrl: string | null;
  exterior360Urls: string[];
}

interface BwManual {
  number: string; language: string; date: string; downloadUrl: string;
}

interface BwData {
  hash: string;
  vehicle: BwVehicle | null;
  options: BwOption[];
  images: BwImages | null;
  manuals: BwManual[];
  sourceUrl: string;
}

type EnrichmentTabSource =
  | "etk"
  | "bmw_configurator"
  | "bmw_manuals"
  | "bimmerwork"
  | "mdecoder"
  | "vindecoderz"
  | "cache"
  | "none";

interface EnrichmentSourceMap {
  vehicle?: { source: EnrichmentTabSource; fetchedAt?: string };
  options?: { source: EnrichmentTabSource; fetchedAt?: string };
  images?: { source: EnrichmentTabSource; fetchedAt?: string };
  manuals?: { source: EnrichmentTabSource; fetchedAt?: string };
}

interface BwCoverage {
  etkCovered: boolean;
  firstPartyOnly: boolean;
  missing: Array<"options" | "paint" | "upholstery" | "productionDate">;
  importPaths?: string[];
}

interface BwResponse {
  found: boolean;
  data?: BwData;
  source?: "bimmerwork" | "mdecoder";
  message?: string;
  queued?: boolean;
  nextBatchIn?: number;
  hashMismatch?: boolean;
  catalogMatches?: CatalogMatch[];
  enrichmentSource?: EnrichmentSourceMap | null;
  coverage?: BwCoverage | null;
}

const SOURCE_LABELS: Record<EnrichmentTabSource, string> = {
  etk: "First-party catalog",
  bmw_configurator: "BMW Configurator",
  bmw_manuals: "BMW Owner's Manuals",
  bimmerwork: "bimmer.work (fallback)",
  mdecoder: "mdecoder (fallback)",
  vindecoderz: "vindecoderz (fallback)",
  cache: "Cached",
  none: "Not available",
};

const FIRST_PARTY_SOURCES: ReadonlySet<EnrichmentTabSource> = new Set([
  "etk",
  "bmw_configurator",
  "bmw_manuals",
]) as unknown as ReadonlySet<EnrichmentTabSource>;

type BadgeVariant = "default" | "secondary" | "outline";

function variantForSource(source: EnrichmentTabSource): BadgeVariant {
  if (FIRST_PARTY_SOURCES.has(source)) return "default";
  if (source === "none") return "outline";
  return "secondary";
}

function TabSourceBadge({ tab, enrichmentSource }: { tab: keyof EnrichmentSourceMap; enrichmentSource?: EnrichmentSourceMap | null }) {
  const entry = enrichmentSource?.[tab];
  if (!entry?.source) return null;
  return (
    <div className="mb-3 flex items-center gap-2 text-xs" data-testid={`source-badge-${tab}`}>
      <span className="text-muted-foreground">Source:</span>
      <Badge variant={variantForSource(entry.source)} className="font-normal">
        {SOURCE_LABELS[entry.source]}
      </Badge>
      {entry.fetchedAt && (
        <span className="text-muted-foreground" title={entry.fetchedAt}>
          {new Date(entry.fetchedAt).toLocaleString()}
        </span>
      )}
    </div>
  );
}

interface QueueStatusResponse {
  status: string;
  nextBatchIn: number;
  attempts: number;
}

const EXAMPLE_VINS = [
  { vin: "WBAFR72030C958857", label: "F10 535i" },
  { vin: "WBS73AK00PCJ00695", label: "G80 M3" },
  { vin: "WBS83CN07PCE12345", label: "G82 M4" },
];

const TABS = [
  { id: "vehicle", label: "Vehicle", icon: CarIcon },
  { id: "options", label: "Options", icon: Settings2 },
  { id: "images", label: "Images", icon: Image },
  { id: "manuals", label: "Manuals", icon: FileText },
  { id: "servicing", label: "Servicing", icon: Droplets },
] as const;

type TabId = typeof TABS[number]["id"];

const SNOB_QUIPS = [
  "Checking the options list… were you naughty or nice?",
  "Verifying it's real Dakota leather, not the plastic stuff…",
  "Counting the M badges to make sure none are aftermarket…",
  "Sniffing for cheap aftermarket exhaust… it's a sin, you know…",
  "Cross-referencing the build sheet with the snob registry…",
  "Looking up whether you got Adaptive M Suspension or just suspension…",
  "Confirming the kidneys are the correct size for the era…",
  "Asking Munich nicely for your factory record…",
  "Decoding which combination of options shouldn't have been ordered together…",
  "Checking if the previous owner ticked the wood trim box. Yikes.",
  "Rummaging through the parts bin from Dingolfing…",
  "Verifying the M Performance bits are actually M Performance…",
  "Looking for any trace of the dreaded Premium Package…",
  "Counting the cup holders. (BMW knows what they did.)",
  "Checking if it's an actual ZHP or someone bought a badge on eBay…",
  "Inspecting the iDrive version. Brace yourself.",
  "Auditing the keyfob count. One missing means a story.",
  "Verifying the model year against the build month against your story…",
  "Pulling the wiring diagram so the next mechanic doesn't cry…",
  "Decoding whether you got the good headlights or the regular ones…",
  "Cross-referencing 5.4 million part numbers…",
  "Walking the parts diagrams page by page…",
  "Comparing dealer pricing in EUR, GBP and AUD so you don't have to…",
  "Matching your chassis code against 1,300+ BMW model variants…",
  "Verifying that bracket really costs €184…",
  "Checking which superseded part number is the one that actually ships…",
  "Sifting through every ECE/US/JP market option for your build…",
  "Looking up if your part has a cheaper Mini, Rolls or Toyota twin…",
  "Pulling the exploded view so you know which clip you'll break…",
];

function DecodeProgress({ label, sublabel, expectedSeconds = 12 }: { label: string; sublabel?: string; expectedSeconds?: number }) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef<number>(Date.now());
  const quipOrderRef = useRef<number[]>([]);
  const [quipIdx, setQuipIdx] = useState(0);

  useEffect(() => {
    startRef.current = Date.now();
    // Build a shuffled order of indices so each lookup gets a fresh sequence.
    const order = SNOB_QUIPS.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    quipOrderRef.current = order;
    setQuipIdx(0);

    const tickId = window.setInterval(() => setElapsedMs(Date.now() - startRef.current), 100);
    const quipId = window.setInterval(() => {
      setQuipIdx((n) => (n + 1) % quipOrderRef.current.length);
    }, 2500);
    return () => {
      window.clearInterval(tickId);
      window.clearInterval(quipId);
    };
  }, []);

  const elapsedSec = elapsedMs / 1000;
  const pct = Math.min(95, 100 * (1 - Math.exp(-elapsedSec / expectedSeconds)));
  const overdue = elapsedSec > expectedSeconds * 2;
  const currentQuip = SNOB_QUIPS[quipOrderRef.current[quipIdx] ?? 0] ?? SNOB_QUIPS[0];

  return (
    <div className="border rounded-lg p-4 space-y-3" data-testid="decode-progress">
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
        <span className="text-sm font-medium truncate" data-testid="text-progress-label">{label}</span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground shrink-0" data-testid="text-progress-elapsed">
          {elapsedSec.toFixed(1)}s
        </span>
      </div>
      <Progress value={pct} className="h-2" data-testid="progress-decode" />
      <p
        key={quipIdx}
        className="text-xs italic text-muted-foreground animate-in fade-in slide-in-from-bottom-1 duration-300"
        data-testid="text-progress-quip"
      >
        {currentQuip}
      </p>
      {sublabel && (
        <p className={`text-xs ${overdue ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/70"}`} data-testid="text-progress-sublabel">
          {overdue ? "Still working — BMW data sources can be slow on the first lookup." : sublabel}
        </p>
      )}
    </div>
  );
}

function proxyImg(url: string | null): string {
  if (!url) return "";
  if (url.startsWith("/images/")) return url;
  return `/api/vin/proxy-image?url=${encodeURIComponent(url)}`;
}

function InfoRow({ icon: Icon, label, value, mono, badge }: {
  icon: typeof CarIcon; label: string; value: string | null | undefined;
  mono?: boolean; badge?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</span>
          {badge && <Badge variant="outline" className="text-xs">{badge}</Badge>}
        </div>
      </div>
    </div>
  );
}

function VinStructureBreakdown({ decoded }: { decoded: VinDecodeResult }) {
  if (!decoded.vin || decoded.vin.length !== 17) return null;
  const segments = [
    { label: "WMI", chars: decoded.wmi, range: "1-3", desc: "Manufacturer" },
    { label: "VDS", chars: decoded.vds, range: "4-9", desc: "Vehicle Descriptor" },
    { label: "VIS", chars: decoded.vis, range: "10-17", desc: "Vehicle Identifier" },
  ];
  return (
    <div className="border rounded-lg overflow-hidden" data-testid="vin-structure">
      <div className="bg-muted/50 px-4 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <Hash className="w-4 h-4 text-muted-foreground" />
          <span className="font-semibold text-sm">VIN Structure</span>
        </div>
      </div>
      <div className="p-4">
        <div className="flex gap-1 font-mono text-lg tracking-widest justify-center mb-4 flex-wrap">
          {decoded.vin.split("").map((char, i) => {
            let bg = "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200";
            if (i >= 3 && i < 9) bg = "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200";
            if (i >= 9) bg = "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200";
            if (i === 8) bg = "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200";
            return (
              <span key={i} className={`inline-flex items-center justify-center w-7 h-9 rounded text-sm font-bold ${bg}`}>
                {char}
              </span>
            );
          })}
        </div>
        <div className="grid grid-cols-3 gap-3 text-center text-xs">
          {segments.map(s => (
            <div key={s.label}>
              <div className="font-bold text-sm">{s.label}</div>
              <div className="text-muted-foreground">Pos {s.range}</div>
              <div className="font-mono text-xs mt-0.5">{s.chars}</div>
              <div className="text-muted-foreground mt-0.5">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function resolveModelYear(decoded: VinDecodeResult, bwVehicle: BwVehicle | null): number | null {
  if (bwVehicle?.startOfProduction) {
    const match = bwVehicle.startOfProduction.match(/(\d{4})/);
    if (match) {
      const prodYear = parseInt(match[1], 10);
      const currentYear = new Date().getFullYear();
      if (prodYear >= 1980 && prodYear <= currentYear + 2) {
        if (!decoded.modelYear || Math.abs(prodYear - decoded.modelYear) > 2) {
          return prodYear;
        }
      }
    }
  }
  return decoded.modelYear;
}

function VehicleTab({ decoded, bwVehicle, matchedCars, decodeStatus, siblings, knownChassis, bwLoading, bwSource, queueCountdown, queueAttempts, enrichmentSource }: {
  decoded: VinDecodeResult;
  bwVehicle: BwVehicle | null;
  matchedCars: CatalogMatch[];
  decodeStatus?: DecodeStatus;
  siblings?: CatalogMatch[];
  knownChassis?: string | null;
  bwLoading?: boolean;
  bwSource?: "bimmerwork" | "mdecoder" | null;
  queueCountdown?: number;
  queueAttempts?: number;
  enrichmentSource?: EnrichmentSourceMap | null;
}) {
  const localize = useLocalizedHref();
  const t = useT();
  const modelYear = resolveModelYear(decoded, bwVehicle);
  const title = bwVehicle?.modelName
    || (decoded.modelName ? `${modelYear || ""} BMW ${decoded.modelName}`.trim() : null)
    || (decoded.nhtsaData?.model ? `${modelYear || ""} BMW ${decoded.nhtsaData.model}`.trim() : null)
    || "BMW Vehicle";

  const safetyFields = decoded.nhtsaData ? [
    { label: "ABS", value: decoded.nhtsaData.abs },
    { label: "ESC", value: decoded.nhtsaData.esc },
    { label: "Traction", value: decoded.nhtsaData.tractionControl },
    { label: "TPMS", value: decoded.nhtsaData.tpms },
  ].filter(f => f.value) : [];

  const [searchTerm, setSearchTerm] = useState("");
  const [expandedCar, setExpandedCar] = useState<number | null>(
    matchedCars.length === 1 ? matchedCars[0].id : null
  );

  const isStale = decoded.dataFreshness === "stale";

  // Carvertical mileage-check affiliate link. Settings are admin-controlled
  // via /api/admin/settings/carvertical (see Admin → External Tools). When
  // disabled or when we don't have a clean VIN to pass, the panel hides itself.
  const carverticalQuery = useQuery<{ a: string; b: string; chan: string; voucher?: string; enabled: boolean }>({
    queryKey: ["/api/settings/carvertical"],
    staleTime: 5 * 60 * 1000,
  });
  const cvSettings = carverticalQuery.data;
  const cvVin = decoded.vin?.toUpperCase().replace(/[\s-]/g, "") || null;
  const cvLink = cvSettings?.enabled && cvVin && cvVin.length === 17
    ? `https://www.carvertical.com/au/precheck?vin=${encodeURIComponent(cvVin)}`
      + `&a=${encodeURIComponent(cvSettings.a)}`
      + `&b=${encodeURIComponent(cvSettings.b)}`
      + (cvSettings.voucher ? `&voucher=${encodeURIComponent(cvSettings.voucher)}` : "")
    : null;

  return (
    <div className="space-y-4">
      {isStale && (
        <div
          className="border border-amber-300 dark:border-amber-700 rounded-lg px-4 py-3 bg-amber-50 dark:bg-amber-950/30 flex items-start gap-3"
          data-testid="banner-data-freshness"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs">
            <div className="font-medium text-amber-800 dark:text-amber-300">
              Local catalog data may be limited for {modelYear || "post-2020"} models
            </div>
            <div className="text-muted-foreground mt-0.5">
              Our offline catalog snapshot ends in early 2020.{" "}
              {bwLoading
                ? "Fetching the live record now…"
                : bwSource === "bimmerwork" || bwSource === "mdecoder"
                ? "Confirmed via the live decode below."
                : "Open the live decode tabs below for an authoritative answer."}
            </div>
          </div>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden" data-testid="vehicle-profile">
        <div className="bg-primary/5 px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <CarIcon className="w-5 h-5 text-primary" />
            <div>
              <div className="font-bold text-base" data-testid="text-vehicle-title">{title}</div>
              {(decoded.chassis || bwVehicle?.codeType) && (
                <div className="text-xs text-muted-foreground">
                  {bwVehicle?.codeType ? `Code: ${bwVehicle.codeType}` : `Chassis: ${decoded.chassis}`}
                  {decoded.generation ? ` (${decoded.generation})` : ""}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <InfoRow icon={Factory} label="Manufacturer" value={bwVehicle?.manufacturer || decoded.manufacturer} />
          <InfoRow icon={Tag} label="Division" value={decoded.division} />
          <InfoRow icon={Calendar} label="Model Year" value={modelYear?.toString()} />
          <InfoRow icon={CarIcon} label="Chassis" value={bwVehicle?.chassis || decoded.bodyType || decoded.nhtsaData?.bodyClass} />
          <InfoRow icon={Globe} label="Market" value={bwVehicle?.market} />
          <InfoRow icon={Cpu} label="Engine" value={bwVehicle?.engine || decoded.engineFamily || decoded.engine} />
          <InfoRow icon={Gauge} label="Drivetrain" value={bwVehicle?.drivetrain || decoded.driveType || decoded.nhtsaData?.driveType} />
          <InfoRow icon={Cog} label="Transmission" value={bwVehicle?.transmission} />
          <InfoRow icon={Palette} label="Color" value={bwVehicle?.color} badge={bwVehicle?.colorCode || undefined} />
          <InfoRow icon={Armchair} label="Upholstery" value={bwVehicle?.upholstery} badge={bwVehicle?.upholsteryCode || undefined} />
          <InfoRow icon={Calendar} label="Start of Production" value={bwVehicle?.startOfProduction} />
          {decoded.plant && (
            <InfoRow icon={MapPin} label="Assembly Plant" value={`${decoded.plant.city}, ${decoded.plant.country}`} />
          )}
          <InfoRow icon={Hash} label="Last 7 (Serial)" value={decoded.last7} mono />
          {decoded.nhtsaData?.engineBrakeHp && (
            <InfoRow icon={Zap} label="Horsepower" value={`${decoded.nhtsaData.engineBrakeHp} hp`} />
          )}
        </div>
        {cvLink && (
          <div className="border-t bg-muted/20 px-4 py-3 flex items-center justify-between gap-3 flex-wrap" data-testid="panel-carvertical">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Gauge className="w-4 h-4 text-muted-foreground" />
              <span>
                Verify mileage and history with an independent vehicle history report.
                {cvSettings?.voucher && (
                  <> Use code <span className="font-semibold text-foreground font-mono">{cvSettings.voucher.toUpperCase()}</span> for <span className="font-semibold text-foreground">20% off</span>.</>
                )}
              </span>
            </div>
            <a
              href={cvLink}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border bg-background hover:bg-primary/5 transition-colors"
              data-testid="link-carvertical-mileage"
            >
              <img
                src="https://www.carvertical.com/favicon.ico"
                alt="carVertical"
                className="w-4 h-4 rounded-sm"
              />
              Check VIN history
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      {safetyFields.length > 0 && (
        <div className="border rounded-lg overflow-hidden" data-testid="nhtsa-data">
          <div className="bg-muted/50 px-4 py-2.5 border-b">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span className="font-semibold text-sm">{t.vin.safetyFeatures}</span>
              <Badge variant="secondary" className="text-xs ml-auto">NHTSA</Badge>
            </div>
          </div>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {safetyFields.map(f => (
              <div key={f.label} className="text-center p-2.5 rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">{f.label}</div>
                <div className="text-xs font-medium flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  {f.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden" data-testid="catalog-matches">
        <div className="bg-muted/50 px-4 py-2.5 border-b">
          <div className="flex items-center gap-2">
            <Package2 className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Parts Catalog</span>
            {matchedCars.length > 0 && (
              <Badge variant="default" className="ml-auto">
                {matchedCars.reduce((s, c) => s + c.totalParts, 0).toLocaleString()} parts
              </Badge>
            )}
          </div>
        </div>
        {matchedCars.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground space-y-3" data-testid={`empty-state-${decodeStatus || "unknown"}`}>
            <Info className="w-6 h-6 mx-auto opacity-50" />
            {decodeStatus === "not_bmw" && (
              <p className="text-sm">This VIN is not a BMW. Catalog matches are only available for BMW vehicles.</p>
            )}
            {decodeStatus === "invalid_vin" && (
              <p className="text-sm">This VIN failed structural validation (check digit) and could not be resolved to a production record.</p>
            )}
            {decodeStatus === "enriching" && (
              <div className="max-w-md mx-auto">
                {(queueAttempts ?? 0) >= 1 && (queueCountdown ?? 0) > 0 ? (
                  <div className="space-y-2 text-left">
                    <p className="text-sm text-foreground">
                      This VIN isn't in our internal database — we're now querying third-party databases. Next attempt in{" "}
                      <span className="tabular-nums font-medium" data-testid="text-queue-countdown">{queueCountdown}s</span>
                      {(queueAttempts ?? 0) > 1 && <> · attempt {queueAttempts}</>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(queueAttempts ?? 0) >= 2
                        ? "Third-party sources don't have this VIN yet. If you have a factory record URL for it, paste it below to skip the queue."
                        : "We'll keep checking automatically. You can also paste a factory record URL below if you have one."}
                    </p>
                  </div>
                ) : (
                  <DecodeProgress
                    label="Looking up factory record"
                    sublabel="Catalog matches will appear once enrichment completes."
                    expectedSeconds={20}
                  />
                )}
              </div>
            )}
            {decodeStatus === "valid_but_unknown" && (
              <p className="text-sm">VIN is structurally valid but cannot be resolved to a known BMW production record.</p>
            )}
            {decodeStatus === "chassis_resolved_no_local_parts" && (
              <div className="space-y-2 max-w-md mx-auto">
                <p className="text-sm text-foreground">
                  We identified this as a <span className="font-medium">{knownChassis}</span> chassis but don't carry parts for it in our catalog yet.
                </p>
                <p className="text-xs text-muted-foreground">
                  We've recorded this gap and an admin can backfill from RealOEM on demand.
                </p>
                {(siblings?.length ?? 0) > 0 && (
                  <div className="text-left pt-2">
                    <p className="text-xs font-medium mb-2 text-foreground">Closest available chassis:</p>
                    <div className="space-y-1.5">
                      {siblings!.slice(0, 4).map(s => (
                        isBmvVinHost()
                          ? <a key={s.id} href={`https://bmv.parts/car/${s.slug}`} className="block text-xs px-3 py-2 rounded-md border bg-background hover:bg-muted/50 transition-colors" data-testid={`link-sibling-${s.id}`}>
                              <span className="font-medium text-foreground">{s.modelName}</span>
                              <span className="text-muted-foreground"> · {s.chassis}</span>
                            </a>
                          : <Link key={s.id} href={localize(`/car/${s.slug}`)} className="block text-xs px-3 py-2 rounded-md border bg-background hover:bg-muted/50 transition-colors" data-testid={`link-sibling-${s.id}`}>
                              <span className="font-medium text-foreground">{s.modelName}</span>
                              <span className="text-muted-foreground"> · {s.chassis}</span>
                            </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {decodeStatus === "no_chassis_carried" && (
              <>
                <p className="text-sm">
                  We don't carry parts for the {knownChassis || "this"} chassis yet.
                </p>
                {(siblings?.length ?? 0) > 0 && (
                  <div className="text-left max-w-md mx-auto pt-2">
                    <p className="text-xs font-medium mb-2 text-foreground">Closest available chassis:</p>
                    <div className="space-y-1.5">
                      {siblings!.slice(0, 4).map(s => (
                        isBmvVinHost()
                          ? <a key={s.id} href={`https://bmv.parts/car/${s.slug}`} className="block text-xs px-3 py-2 rounded-md border bg-background hover:bg-muted/50 transition-colors" data-testid={`link-sibling-${s.id}`}>
                              <span className="font-medium text-foreground">{s.modelName}</span>
                              <span className="text-muted-foreground"> · {s.chassis}</span>
                            </a>
                          : <Link key={s.id} href={localize(`/car/${s.slug}`)} className="block text-xs px-3 py-2 rounded-md border bg-background hover:bg-muted/50 transition-colors" data-testid={`link-sibling-${s.id}`}>
                              <span className="font-medium text-foreground">{s.modelName}</span>
                              <span className="text-muted-foreground"> · {s.chassis}</span>
                            </Link>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {!decodeStatus && (
              <p className="text-sm">No catalog matches for this vehicle.</p>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {matchedCars.map(car => (
              <div key={car.id}>
                <button
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left"
                  onClick={() => setExpandedCar(expandedCar === car.id ? null : car.id)}
                  data-testid={`button-expand-car-${car.id}`}
                >
                  <CarIcon className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{car.modelName}</div>
                    <div className="text-xs text-muted-foreground">{car.chassis} · {car.engine} · {car.bodyType}</div>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{car.totalParts.toLocaleString()}</Badge>
                  <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expandedCar === car.id ? "rotate-90" : ""}`} />
                </button>
                {expandedCar === car.id && (
                  <div className="px-4 pb-4 bg-muted/10">
                    {(car as any).isExternalCatalog ? (
                      <div className="text-xs text-muted-foreground mb-3" data-testid={`text-external-catalog-${car.id}`}>
                        External catalog match — {car.totalParts.toLocaleString()} parts available via search.
                      </div>
                    ) : (
                      isBmvVinHost()
                        ? <a href={`https://bmv.parts/car/${car.slug}`} className="text-xs text-primary hover:underline flex items-center gap-1 mb-3" data-testid={`link-browse-car-${car.id}`}>
                            Browse full catalog <ExternalLink className="w-3 h-3" />
                          </a>
                        : <Link href={localize(`/car/${car.slug}`)} className="text-xs text-primary hover:underline flex items-center gap-1 mb-3" data-testid={`link-browse-car-${car.id}`}>
                            Browse full catalog <ExternalLink className="w-3 h-3" />
                          </Link>
                    )}
                    {(car.categories?.length ?? 0) > 0 && !(car as any).isExternalCatalog && (
                      <>
                        <div className="relative mb-3">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input placeholder="Filter categories..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 h-8 text-xs" data-testid="input-filter-categories" />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {(car.categories || []).filter(c => !searchTerm || c.name.toLowerCase().includes(searchTerm.toLowerCase())).map(cat => (
                            isBmvVinHost()
                              ? <a key={cat.id} href={`https://bmv.parts/car/${car.slug}?cat=${cat.id}`} className="text-xs px-3 py-2 rounded-md border bg-background hover:bg-muted/50 transition-colors flex items-center gap-2" data-testid={`link-category-${cat.id}`}>
                                  <Cog className="w-3 h-3 text-muted-foreground shrink-0" />
                                  <span className="truncate">{cat.name}</span>
                                </a>
                              : <Link key={cat.id} href={localize(`/car/${car.slug}?cat=${cat.id}`)} className="text-xs px-3 py-2 rounded-md border bg-background hover:bg-muted/50 transition-colors flex items-center gap-2" data-testid={`link-category-${cat.id}`}>
                                  <Cog className="w-3 h-3 text-muted-foreground shrink-0" />
                                  <span className="truncate">{cat.name}</span>
                                </Link>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {decoded.vin && (
        <div className="border rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap bg-muted/20" data-testid="vehicle-tab-servicing-cta">
          <div className="flex items-center gap-2 text-sm">
            <Droplets className="w-4 h-4 text-muted-foreground" />
            <span>{t.servicing?.needHint ?? "Need fluid capacities & filter part numbers for routine servicing?"}</span>
          </div>
          <Link
            href={localize(`/servicing/${decoded.vin}`)}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            data-testid="link-vehicle-tab-servicing"
          >
            {t.servicing?.openCta ?? "Open Quick Servicing Info"} <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {matchedCars.length > 0 && (
        <div className="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10 rounded-lg p-4" data-testid="mperformance-promo">
          <div className="flex items-start gap-3">
            <Tag className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-sm text-blue-800 dark:text-blue-200">
                Shop Parts for Your {decoded.modelName || decoded.chassis || "BMW"}
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                Check live stock at MPerformance.parts. Use code <span className="font-mono font-bold">PARTFINDER10</span> for 10% off.
              </p>
              <a href={trackedHref("https://mperformance.parts", { label: "MPerformance.parts", source: "vin-decoder" })} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline" data-testid="link-mperformance">
                Visit MPerformance.parts <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OptionsTab({ options, enrichmentSource, coverage }: { options: BwOption[]; enrichmentSource?: EnrichmentSourceMap | null; coverage?: { etkCovered?: boolean; missing?: string[] } | null }) {
  const [filter, setFilter] = useState("");
  const filtered = options.filter(o =>
    !filter || o.code.toLowerCase().includes(filter.toLowerCase()) ||
    o.nameEn.toLowerCase().includes(filter.toLowerCase())
  );

  if (options.length === 0) {
    // ETK-covered VIN with no per-VIN FA: be honest that the dataset
    // doesn't carry factory options for this VIN, instead of implying
    // the lookup failed transiently. (Task #83.)
    const etkCovered = coverage?.etkCovered === true;
    const missingOptions = (coverage?.missing || []).includes("options");
    return (
      <div data-testid="options-empty-wrapper">
        <TabSourceBadge tab="options" enrichmentSource={enrichmentSource} />
        <div className="border rounded-lg p-8 text-center text-muted-foreground" data-testid="options-empty">
          <Settings2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          {etkCovered && missingOptions ? (
            <>
              <p className="text-sm">Factory options not in our dataset for this VIN.</p>
              <p className="text-xs mt-1">We have the chassis and engine, but the per-VIN factory order (SA list) isn't available.</p>
            </>
          ) : (
            <>
              <p className="text-sm">No factory options data available for this VIN.</p>
              <p className="text-xs mt-1">Options data requires a successful VIN enrichment lookup.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="options-tab">
      <TabSourceBadge tab="options" enrichmentSource={enrichmentSource} />
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Filter options..." value={filter} onChange={e => setFilter(e.target.value)} className="pl-9 h-9" data-testid="input-filter-options" />
        </div>
        <Badge variant="secondary">{filtered.length} of {options.length}</Badge>
      </div>
      <div className="border rounded-lg overflow-hidden divide-y">
        {filtered.map(opt => (
          <div key={opt.code} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors" data-testid={`option-${opt.code}`}>
            {opt.imageUrl ? (
              <img src={proxyImg(opt.imageUrl)} alt={opt.code} className="w-16 h-10 rounded object-cover bg-muted shrink-0" loading="lazy" />
            ) : (
              <div className="w-16 h-10 rounded bg-muted/50 flex items-center justify-center shrink-0">
                <Settings2 className="w-4 h-4 text-muted-foreground/40" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs shrink-0">{opt.code}</Badge>
                <span className="text-sm font-medium truncate">{opt.nameEn}</span>
              </div>
              {opt.nameDe && opt.nameDe !== opt.nameEn && (
                <div className="text-xs text-muted-foreground truncate mt-0.5">{opt.nameDe}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Viewer360({ urls, modelName }: { urls: string[]; modelName: string }) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setFrameIndex(prev => (prev + 1) % urls.length);
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, urls.length]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartX(e.clientX);
    setIsPlaying(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const delta = e.clientX - startX;
    if (Math.abs(delta) > 15) {
      const direction = delta > 0 ? 1 : -1;
      setFrameIndex(prev => (prev + direction + urls.length) % urls.length);
      setStartX(e.clientX);
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setIsPlaying(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const delta = e.touches[0].clientX - startX;
    if (Math.abs(delta) > 15) {
      const direction = delta > 0 ? 1 : -1;
      setFrameIndex(prev => (prev + direction + urls.length) % urls.length);
      setStartX(e.touches[0].clientX);
    }
  };

  return (
    <div className="space-y-2">
      <div
        className="relative select-none cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        data-testid="viewer-360"
      >
        <img src={proxyImg(urls[frameIndex])} alt={`${modelName} 360° frame ${frameIndex + 1}`} className="w-full" draggable={false} />
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
          {frameIndex + 1} / {urls.length}
        </div>
      </div>
      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setFrameIndex(prev => (prev - 1 + urls.length) % urls.length)} data-testid="button-360-prev">
          ← Prev
        </Button>
        <Button variant={isPlaying ? "default" : "outline"} size="sm" onClick={() => setIsPlaying(!isPlaying)} data-testid="button-360-play">
          {isPlaying ? "⏸ Pause" : "▶ Play"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setFrameIndex(prev => (prev + 1) % urls.length)} data-testid="button-360-next">
          Next →
        </Button>
      </div>
      <p className="text-xs text-muted-foreground text-center">Drag to rotate or use controls</p>
    </div>
  );
}

function ImagesTab({ images, modelName, enrichmentSource }: { images: BwImages | null; modelName: string; enrichmentSource?: EnrichmentSourceMap | null }) {
  const has360 = images && images.exterior360Urls.length > 0;
  const [view, setView] = useState<"exterior" | "interior" | "360">("exterior");

  if (!images || (!images.exteriorUrl && !images.interiorUrl && !has360)) {
    return (
      <div data-testid="images-empty-wrapper">
        <TabSourceBadge tab="images" enrichmentSource={enrichmentSource} />
        <div className="border rounded-lg p-8 text-center text-muted-foreground" data-testid="images-empty">
          <Image className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No configuration images available for this VIN.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="images-tab">
      <TabSourceBadge tab="images" enrichmentSource={enrichmentSource} />
      <div className="flex gap-2">
        {images.exteriorUrl && (
          <Button variant={view === "exterior" ? "default" : "outline"} size="sm" onClick={() => setView("exterior")} data-testid="button-exterior">
            Exterior
          </Button>
        )}
        {images.interiorUrl && (
          <Button variant={view === "interior" ? "default" : "outline"} size="sm" onClick={() => setView("interior")} data-testid="button-interior">
            Interior
          </Button>
        )}
        {has360 && (
          <Button variant={view === "360" ? "default" : "outline"} size="sm" onClick={() => setView("360")} data-testid="button-360">
            360°
          </Button>
        )}
      </div>
      <div className="border rounded-lg overflow-hidden bg-muted/10">
        {view === "exterior" && images.exteriorUrl && (
          <img src={proxyImg(images.exteriorUrl)} alt={`${modelName} exterior`} className="w-full" data-testid="img-exterior" />
        )}
        {view === "interior" && images.interiorUrl && (
          <img src={proxyImg(images.interiorUrl)} alt={`${modelName} interior`} className="w-full" data-testid="img-interior" />
        )}
        {view === "360" && has360 && (
          <Viewer360 urls={images.exterior360Urls} modelName={modelName} />
        )}
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Configuration images — exact factory specification for this VIN
      </p>
    </div>
  );
}

function ManualsTab({ manuals, enrichmentSource }: { manuals: BwManual[]; enrichmentSource?: EnrichmentSourceMap | null }) {
  const LANG_NAMES: Record<string, string> = {
    "de-DE": "German", "en-GB": "English (UK)", "en-US": "English (US)",
    "fr": "French", "es": "Spanish", "it": "Italian", "nl": "Dutch",
    "sv": "Swedish", "ar": "Arabic", "pt": "Portuguese", "pl": "Polish",
    "ru": "Russian", "ja": "Japanese", "ko": "Korean", "zh-CN": "Chinese (Simplified)",
    "zh-TW": "Chinese (Traditional)", "th": "Thai", "tr": "Turkish",
    "fr-CA": "French (Canada)", "de": "German", "en": "English",
    "hi-IN": "Hindi",
  };

  if (manuals.length === 0) {
    return (
      <div data-testid="manuals-empty-wrapper">
        <TabSourceBadge tab="manuals" enrichmentSource={enrichmentSource} />
        <div className="border rounded-lg p-8 text-center text-muted-foreground" data-testid="manuals-empty">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No owner's manuals available for this VIN.</p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="manuals-tab-wrapper">
      <TabSourceBadge tab="manuals" enrichmentSource={enrichmentSource} />
    <div className="border rounded-lg overflow-hidden" data-testid="manuals-tab">
      <div className="bg-muted/50 px-4 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-muted-foreground" />
          <span className="font-semibold text-sm">Owner's Manuals</span>
          <Badge variant="secondary" className="ml-auto text-xs">{manuals.length}</Badge>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/20">
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Number</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Language</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {manuals.map((m, i) => (
              <tr key={i} className="hover:bg-muted/30 transition-colors" data-testid={`manual-${i}`}>
                <td className="px-4 py-2 font-mono text-xs">{m.number}</td>
                <td className="px-4 py-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3 h-3 text-muted-foreground" />
                    {LANG_NAMES[m.language] || m.language}
                  </div>
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{m.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
}

export default function VinDecoder({ params }: { params?: { vin?: string } }) {
  const t = useT();
  const [currentPath] = useLocation();
  const { locale: activeLocale } = splitLocaleFromPath(currentPath);
  // Localize-aware href helper for chassis / series hub links rendered in
  // the evergreen SEO section below. Lives at the top of the main
  // component so all JSX returned from this function can use it.
  const localize = useLocalizedHref();
  const [vinInput, setVinInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("vehicle");
  const [decodedVin, setDecodedVin] = useState<string | null>(null);
  const [manualHashInput, setManualHashInput] = useState("");
  const [showHashInput, setShowHashInput] = useState(false);
  const [manualHash, setManualHash] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [savedVin, setSavedVin] = useState(false);
  const [autoDecodeTriggered, setAutoDecodeTriggered] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async (vin: string) => {
      const res = await apiRequest("POST", "/api/my-cars", { vin });
      return res.json();
    },
    onSuccess: () => {
      setSavedVin(true);
      queryClient.invalidateQueries({ queryKey: ["/api/my-cars"] });
      toast({ title: "Saved to My Cars", description: "This vehicle has been added to your garage." });
    },
    onError: (err: any) => {
      let errorText = err.message;
      try { errorText = JSON.parse(err.message.split(":").slice(1).join(":").trim()).error || errorText; } catch {}
      if (errorText?.toLowerCase().includes("already")) {
        setSavedVin(true);
        toast({ title: "Already saved", description: "This VIN is already in your garage." });
      } else {
        toast({ title: "Failed to save", description: errorText, variant: "destructive" });
      }
    },
  });

  const decodeMutation = useMutation<DecodeResponse, Error, string>({
    mutationFn: async (input: string) => {
      const clean = input.toUpperCase().replace(/[\s\-]/g, "");
      const res = await apiRequest("POST", "/api/vin/decode", {
        vin: clean.length === 17 ? clean : undefined,
        last7: clean.length === 7 ? clean : undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.decoded.vin && data.decoded.vin.length === 17) {
        setDecodedVin(data.decoded.vin);
        setManualHash(null);
        setShowHashInput(false);
        setManualHashInput("");
      }
    },
  });

  useEffect(() => {
    if (params?.vin && !autoDecodeTriggered) {
      const clean = params.vin.toUpperCase().replace(/[\s\-]/g, "");
      if (clean.length === 17 || clean.length === 7) {
        setVinInput(clean);
        setAutoDecodeTriggered(true);
        decodeMutation.mutate(clean);
      }
    }
  }, [params?.vin]);

  // Hydrate React Query cache from the SSR prefetch JSON island
  // (`<script id="bmv-vin-prefetch">`). Server-side rendered VIN
  // landings already include the bimmer.work payload (vehicle, options,
  // images, manuals, enrichmentSource), so seeding the cache here lets
  // the SPA show the same data instantly on hydration without a
  // duplicate /api/vin/bimmerwork round trip. Runs once per VIN.
  const prefetchHydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const node = document.getElementById("bmv-vin-prefetch");
    if (!node) return;
    const ssrVin = node.getAttribute("data-vin");
    if (!ssrVin) return;
    if (prefetchHydratedRef.current === ssrVin) return;
    try {
      const raw = node.textContent || "";
      if (!raw.trim()) return;
      const payload = JSON.parse(raw) as {
        vin: string;
        found: boolean;
        data: BwData | null;
        enrichmentSource?: EnrichmentSourceMap | null;
      };
      const seeded: BwResponse = {
        found: !!payload.found,
        data: payload.data ?? undefined,
        enrichmentSource: payload.enrichmentSource ?? null,
      };
      // manualHash starts as null; seed both shapes (null and undefined)
      // for safety against React Query key normalization differences.
      queryClient.setQueryData(["/api/vin/bimmerwork", ssrVin, null], seeded);
      queryClient.setQueryData(["/api/vin/bimmerwork", ssrVin, undefined], seeded);
      prefetchHydratedRef.current = ssrVin;
    } catch (err) {
      console.warn("[vin-prefetch] failed to parse SSR island", err);
    }
  }, [decodedVin]);

  const bwQuery = useQuery<BwResponse>({
    queryKey: ["/api/vin/bimmerwork", decodedVin, manualHash],
    queryFn: async () => {
      const hashParam = manualHash ? `?hash=${encodeURIComponent(manualHash)}` : "";
      const res = await fetch(`/api/vin/bimmerwork/${decodedVin}${hashParam}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!decodedVin,
    retry: false,
  });

  const bwData = bwQuery.data?.found ? bwQuery.data.data || null : null;
  const enrichSource = bwQuery.data?.source || null;
  const isHashMismatch = bwQuery.data?.hashMismatch === true;
  const isNotIndexed = bwQuery.data && !bwQuery.data.found && !bwQuery.isLoading && !isHashMismatch;

  const queueQuery = useQuery<QueueStatusResponse>({
    queryKey: ["/api/vin/queue-status", decodedVin],
    queryFn: async () => {
      const res = await fetch(`/api/vin/queue-status/${decodedVin}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!decodedVin && !!isNotIndexed,
    refetchInterval: (query) => {
      const st = (query.state.data as QueueStatusResponse | undefined)?.status;
      if (st === "found" || st === "not_found") return false;
      return 5000;
    },
  });

  const queueStatus = queueQuery.data?.status;
  const isQueueActive = queueStatus === "pending" || queueStatus === "processing";

  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<number>(0);

  useEffect(() => {
    if (!queueQuery.data || !isQueueActive) return;
    const secs = Math.ceil(queueQuery.data.nextBatchIn / 1000);
    countdownRef.current = secs;
    setCountdown(secs);
  }, [queueQuery.data?.nextBatchIn, isQueueActive]);

  const refreshScheduled = useRef(false);

  useEffect(() => {
    if (!isQueueActive) {
      refreshScheduled.current = false;
      return;
    }
    const timer = setInterval(() => {
      countdownRef.current = Math.max(0, countdownRef.current - 1);
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0 && decodedVin && !refreshScheduled.current) {
        refreshScheduled.current = true;
        clearInterval(timer);
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/vin/queue-status", decodedVin] });
          refreshScheduled.current = false;
        }, 20000);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isQueueActive, decodedVin]);

  useEffect(() => {
    if (queueStatus === "found" && decodedVin) {
      queryClient.invalidateQueries({ queryKey: ["/api/vin/bimmerwork", decodedVin] });
    }
  }, [queueStatus, decodedVin]);

  const handleDecode = () => {
    const clean = vinInput.toUpperCase().replace(/[\s\-]/g, "");
    if (clean.length !== 17 && clean.length !== 7) return;
    setDecodedVin(null);
    setActiveTab("vehicle");
    setSavedVin(false);
    decodeMutation.mutate(clean);
  };

  const handleCopyVin = () => {
    if (decodeMutation.data?.decoded.vin) {
      navigator.clipboard.writeText(decodeMutation.data.decoded.vin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleManualHash = () => {
    const input = manualHashInput.trim();
    const hashFromUrl = input.match(/bimmer\.work\/vin\/([a-z0-9]{20,50})/);
    const rawHash = hashFromUrl ? hashFromUrl[1] : input.match(/^[a-z0-9]{20,50}$/) ? input : null;
    if (rawHash && decodedVin) {
      setManualHash(rawHash);
      setShowHashInput(false);
      queryClient.invalidateQueries({ queryKey: ["/api/vin/bimmerwork", decodedVin] });
    }
  };

  const cleanLen = vinInput.toUpperCase().replace(/[\s\-]/g, "").length;
  const isValidLength = cleanLen === 17 || cleanLen === 7;

  const decoded = decodeMutation.data?.decoded;
  const modelName = bwData?.vehicle?.modelName || (decoded?.modelName ? `BMW ${decoded.modelName}` : "BMW Vehicle");

  // When a VIN is decoded the page promotes to a per-VIN landing
  // (dynamic title/description, Vehicle + BreadcrumbList JSON-LD,
  // per-VIN canonical). Otherwise it serves the evergreen /vin tool
  // with WebApplication + HowTo + FAQPage JSON-LD.
  const decodedVinForSeo = decoded?.vin && decoded.vin.length === 17 ? decoded.vin.toUpperCase() : null;
  // On the bmv.vin vanity host the public URL has no /vin prefix. The
  // SEO component (and the SSR layer) automatically rewrite paths for
  // canonical/alternate/breadcrumb URLs, but inline absolute URLs in
  // JSON-LD have to be host-aware here.
  const onVinHost = typeof window !== "undefined"
    && /^(www\.)?bmv\.vin$/i.test(window.location.hostname);
  const vinSeoOrigin = onVinHost ? "https://bmv.vin" : "https://bmv.parts";
  const vinSeoVinUrl = decodedVinForSeo
    ? (onVinHost ? `${vinSeoOrigin}/${decodedVinForSeo}` : `${vinSeoOrigin}/vin/${decodedVinForSeo}`)
    : null;
  const vinSeoToolUrl = onVinHost ? `${vinSeoOrigin}/` : `${vinSeoOrigin}/vin`;
  const seoBasePath = decodedVinForSeo ? `/vin/${decodedVinForSeo}` : "/vin";
  const seoAlternates = CLIENT_LOCALES.map(l => ({
    bcp47: l.bcp47,
    path: withLocalePrefix(l.prefix, seoBasePath),
  }));
  const vinTopicHeadline = decodedVinForSeo
    ? [
        decoded?.modelYear ? String(decoded.modelYear) : null,
        bwData?.vehicle?.modelName ? `BMW ${bwData.vehicle.modelName}` : (decoded?.modelName ? `BMW ${decoded.modelName}` : null),
        bwData?.vehicle?.chassis || decoded?.chassis ? `(${bwData?.vehicle?.chassis || decoded?.chassis})` : null,
      ].filter(Boolean).join(" ") || "BMW Vehicle"
    : t.vinSeo.introH1;
  const seoTitle = decodedVinForSeo
    ? `${vinTopicHeadline} — VIN ${decodedVinForSeo}`
    : t.vinSeo.pageTitle;
  const seoDescription = decodedVinForSeo
    ? `${vinTopicHeadline} — decoded BMW VIN ${decodedVinForSeo}. Chassis, engine, factory options and matching OEM parts catalog on BMV.parts.`
    : t.vinSeo.pageDescription;

  // Evergreen JSON-LD: WebApplication + HowTo + FAQPage. The HowTo block is
  // populated from the localized strings so each language yields a valid
  // schema.org payload (steps, name, text). FAQPage mirrors the visible Q/A
  // list on the page so search engines can verify the rich-result content.
  const evergreenJsonLd: Record<string, any>[] = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: t.vinSeo.introH1,
      url: vinSeoToolUrl,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript",
      description: t.vinSeo.pageDescription,
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      provider: { "@type": "Organization", name: "BMV.parts", url: "https://bmv.parts" },
      audience: {
        "@type": "Audience",
        audienceType: "BMW group vehicle owners, technicians and enthusiasts (BMW, ALPINA, MINI, Rolls-Royce, BMW Motorrad)",
      },
      // Brand-complete feature list — explicitly enumerates the BMW group
      // marques we decode so SERP rich results surface beyond just "BMW".
      featureList: [
        "Decode 17-character BMW VIN to chassis, engine and plant",
        "Decode last-7 BMW production sequence",
        "Decode ALPINA VIN (WBA / WBS WMI)",
        "Decode MINI VIN (WMW WMI)",
        "Decode Rolls-Royce VIN (SBM WMI)",
        "Decode BMW Motorrad VIN (WBW / WUF WMI)",
        "Reveal factory option codes (S- and P-codes) with descriptions",
        "Reveal original paint code, upholstery and build date",
        "Match decoded VIN into the OEM parts catalog by chassis",
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: t.vinSeo.howItWorksHeading,
      description: t.vinSeo.howItWorksIntro,
      step: t.vinSeo.howItWorksSteps.map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: s.name,
        text: s.text,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: t.vinSeo.faqs.map(f => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];

  // Per-VIN structured data: append Vehicle + a VIN-specific BreadcrumbList
  // when we have decoded data. The page renders the breadcrumb visually too
  // (see below) so this matches what crawlers see.
  const perVinJsonLd: Record<string, any>[] = decodedVinForSeo
    ? [
        {
          "@context": "https://schema.org",
          "@type": "Vehicle",
          name: vinTopicHeadline,
          vehicleIdentificationNumber: decodedVinForSeo,
          brand: { "@type": "Brand", name: "BMW" },
          manufacturer: { "@type": "Organization", name: bwData?.vehicle?.manufacturer || "BMW" },
          url: vinSeoVinUrl!,
          ...(decoded?.modelYear ? { vehicleModelDate: String(decoded.modelYear) } : {}),
          ...(decoded?.modelName ? { model: decoded.modelName } : {}),
          ...(bwData?.vehicle?.chassis || decoded?.chassis
            ? { vehicleConfiguration: bwData?.vehicle?.chassis || decoded?.chassis }
            : {}),
          ...(bwData?.vehicle?.color ? { color: bwData.vehicle.color } : {}),
          ...(bwData?.vehicle?.engine
            ? { vehicleEngine: { "@type": "EngineSpecification", engineType: bwData.vehicle.engine } }
            : {}),
          ...(bwData?.vehicle?.transmission ? { vehicleTransmission: bwData.vehicle.transmission } : {}),
          ...(bwData?.vehicle?.startOfProduction ? { productionDate: bwData.vehicle.startOfProduction } : {}),
        },
      ]
    : [];

  const seoStructuredData = [...evergreenJsonLd, ...perVinJsonLd];
  const seoBreadcrumbs = decodedVinForSeo
    ? [
        { name: t.vinSeo.breadcrumbHome, url: "/" },
        { name: t.vinSeo.breadcrumbVin, url: "/vin" },
        { name: decodedVinForSeo, url: `/vin/${decodedVinForSeo}` },
      ]
    : [
        { name: t.vinSeo.breadcrumbHome, url: "/" },
        { name: t.vinSeo.breadcrumbVin, url: "/vin" },
      ];

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <SEO
        title={seoTitle}
        description={seoDescription}
        keywords={t.vinSeo.pageKeywords}
        path={seoBasePath}
        alternates={seoAlternates}
        structuredData={seoStructuredData}
        breadcrumbs={seoBreadcrumbs}
      />
      <div>
        {decodedVinForSeo ? (
          <>
            <h1 className="text-2xl font-bold" data-testid="text-vin-landing-h1">
              {vinTopicHeadline} — VIN {decodedVinForSeo}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {seoDescription}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">{t.vin.heading}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t.vin.intro}
            </p>
          </>
        )}
      </div>

      <div className="border rounded-lg p-4 space-y-3" data-testid="vin-input-section">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Hash className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t.vin.placeholder}
              value={vinInput}
              onChange={e => setVinInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && isValidLength && handleDecode()}
              className="pl-9 font-mono text-base tracking-wider uppercase"
              maxLength={17}
              data-testid="input-vin"
            />
          </div>
          <Button onClick={handleDecode} disabled={!isValidLength || decodeMutation.isPending} data-testid="button-decode">
            {decodeMutation.isPending ? (
              <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t.vin.decoding}</span>
            ) : (
              <span className="flex items-center gap-2"><Search className="w-4 h-4" />{t.vin.decode}</span>
            )}
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">{t.vin.examples}</span>
          {EXAMPLE_VINS.map(ex => (
            <button key={ex.vin} onClick={() => { setVinInput(ex.vin); setDecodedVin(null); setActiveTab("vehicle"); setSavedVin(false); decodeMutation.mutate(ex.vin); }} className="text-xs px-2 py-1 rounded-md border bg-muted/30 hover:bg-muted transition-colors font-mono" data-testid={`button-example-${ex.label.replace(/\s/g, "-")}`}>
              {ex.label}
            </button>
          ))}
        </div>
        {cleanLen > 0 && !isValidLength && (
          <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{t.vin.lengthHint(cleanLen)}</span>
          </div>
        )}
      </div>

      {decodeMutation.isPending && (
        <div className="space-y-4" data-testid="loading-skeleton">
          <DecodeProgress label={t.vin.decodeProgress} sublabel={t.vin.decodeProgressSub} expectedSeconds={12} />
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      )}

      {decodeMutation.isError && (
        <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-4 flex items-start gap-3" data-testid="decode-error">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-sm">{t.vin.decodeFailed}</div>
            <div className="text-xs text-muted-foreground mt-1">{decodeMutation.error.message}</div>
          </div>
        </div>
      )}

      {decoded && !decodeMutation.isPending && (
        <div className="space-y-4">
          {decoded.validationErrors.length > 0 && (
            <div className="border border-amber-300/50 bg-amber-50 dark:bg-amber-900/10 rounded-lg p-3 flex items-start gap-3" data-testid="validation-warnings">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-sm text-amber-800 dark:text-amber-300">{t.vin.validationNotes}</div>
                <ul className="text-xs text-amber-700 dark:text-amber-400 mt-1 space-y-0.5">
                  {decoded.validationErrors.map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              </div>
            </div>
          )}

          {decoded.vin && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm tracking-widest font-bold" data-testid="text-decoded-vin">{decoded.vin}</span>
              <button onClick={handleCopyVin} className="p-1 rounded hover:bg-muted transition-colors" data-testid="button-copy-vin">
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
              {decoded.isValid && <Badge variant="default" className="bg-green-600 text-xs"><CheckCircle2 className="w-3 h-3 mr-1" /> {t.vin.valid}</Badge>}
              {decoded.isBmw && <Badge variant="secondary" className="text-xs">BMW</Badge>}
              {bwQuery.isLoading && (
                <Badge variant="outline" className="text-xs animate-pulse">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" /> {t.vin.enriching}
                </Badge>
              )}
              {bwData && enrichSource === "bimmerwork" && (
                <Badge variant="outline" className="text-xs text-green-600 border-green-300" data-testid="badge-enriched-full">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> {t.vin.fullyEnriched}
                </Badge>
              )}
              {bwData && enrichSource === "mdecoder" && (
                <>
                  <Badge variant="outline" className="text-xs text-blue-600 border-blue-300" data-testid="badge-enriched-partial">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> {t.vin.partiallyEnriched}
                  </Badge>
                  {!showHashInput && (
                    <button
                      onClick={() => setShowHashInput(true)}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                      data-testid="button-full-enrich"
                    >
                      <Link2 className="w-3 h-3" /> Have bimmer.work link?
                    </button>
                  )}
                </>
              )}
              {bwQuery.isError && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">{t.vin.enrichmentUnavailable}</Badge>
              )}
              {isHashMismatch && (
                <>
                  <Badge variant="outline" className="text-xs text-red-600 border-red-300" data-testid="badge-hash-mismatch">
                    URL doesn't match VIN
                  </Badge>
                  <button
                    onClick={() => {
                      setManualHash(null);
                      setManualHashInput("");
                      setShowHashInput(true);
                      queryClient.invalidateQueries({ queryKey: ["/api/vin/bimmerwork", decodedVin] });
                    }}
                    className="text-xs text-primary hover:underline"
                    data-testid="button-retry-hash"
                  >
                    Try again
                  </button>
                </>
              )}
              {isNotIndexed && (
                <>
                  <Badge variant="outline" className={`text-xs ${queueStatus === "not_found" ? "text-amber-600 border-amber-300" : "text-muted-foreground"}`} data-testid="badge-not-indexed">
                    {queueStatus === "not_found" ? (
                      <>not available</>
                    ) : isQueueActive && countdown <= 0 ? (
                      <><Loader2 className="w-3 h-3 mr-1 animate-spin inline" />checking...</>
                    ) : (
                      <>
                        not indexed
                        {isQueueActive && countdown > 0 && (
                          <span className="ml-1 tabular-nums">· retry {countdown}s</span>
                        )}
                        {queueStatus === "processing" && (
                          <Loader2 className="w-3 h-3 ml-1 animate-spin inline" />
                        )}
                      </>
                    )}
                  </Badge>
                  {!showHashInput && (
                    <button
                      onClick={() => setShowHashInput(true)}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                      data-testid="button-provide-url"
                    >
                      <Link2 className="w-3 h-3" /> Have the URL?
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {showHashInput && (isNotIndexed || isHashMismatch || (bwData && enrichSource === "mdecoder")) && (
            <div className="border rounded-lg p-3 bg-muted/20 space-y-2" data-testid="manual-hash-input">
              <div className="text-xs text-muted-foreground">
                Paste the enrichment URL for this VIN (e.g. https://bimmer.work/vin/abc123...)
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="https://bimmer.work/vin/..."
                  value={manualHashInput}
                  onChange={e => setManualHashInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleManualHash()}
                  className="text-xs font-mono h-8"
                  data-testid="input-manual-hash"
                />
                <Button size="sm" onClick={handleManualHash} disabled={!manualHashInput.trim()} className="h-8 text-xs" data-testid="button-submit-hash">
                  Lookup
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowHashInput(false); setManualHashInput(""); }} className="h-8 text-xs" data-testid="button-cancel-hash">
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {isAuthenticated && decoded.vin && decoded.vin.length === 17 && (
            <div className="flex items-center gap-2">
              <Button
                variant={savedVin ? "outline" : "default"}
                size="sm"
                disabled={savedVin || saveMutation.isPending}
                onClick={() => saveMutation.mutate(decoded.vin)}
                data-testid="button-save-to-garage"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : savedVin ? (
                  <Check className="w-4 h-4 mr-2 text-green-500" />
                ) : (
                  <Bookmark className="w-4 h-4 mr-2" />
                )}
                {savedVin ? "Saved to My Cars" : "Add to My Cars"}
              </Button>
            </div>
          )}

          <VinStructureBreakdown decoded={decoded} />

          <div className="border rounded-lg overflow-hidden">
            <div className="flex border-b bg-muted/30">
              {TABS.map(tab => {
                const Icon = tab.icon;
                const hasData = tab.id === "vehicle" ? true
                  : tab.id === "options" ? (bwData?.options?.length ?? 0) > 0
                  : tab.id === "images" ? !!bwData?.images?.exteriorUrl
                  : tab.id === "servicing" ? true
                  : (bwData?.manuals?.length ?? 0) > 0;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                      activeTab === tab.id
                        ? "border-primary text-primary bg-background"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                    data-testid={`tab-${tab.id}`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                    {tab.id !== "vehicle" && !bwData && bwQuery.isLoading && (
                      <Loader2 className="w-3 h-3 animate-spin ml-1" />
                    )}
                    {hasData && tab.id === "options" && bwData && (
                      <Badge variant="secondary" className="text-xs ml-1 hidden sm:inline-flex">{bwData.options.length}</Badge>
                    )}
                    {hasData && tab.id === "manuals" && bwData && (
                      <Badge variant="secondary" className="text-xs ml-1 hidden sm:inline-flex">{bwData.manuals.length}</Badge>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="p-4">
              {activeTab === "vehicle" && (
                <VehicleTab
                  decoded={decoded}
                  bwVehicle={bwData?.vehicle || null}
                  matchedCars={(() => {
                    const initial = decodeMutation.data?.matchedCars || [];
                    if (initial.length > 0) return initial;
                    const enrichMatches = bwQuery.data?.catalogMatches || [];
                    return enrichMatches;
                  })()}
                  decodeStatus={(() => {
                    const initial = decodeMutation.data?.matchedCars || [];
                    const enrichMatches = bwQuery.data?.catalogMatches || [];
                    if (initial.length > 0 || enrichMatches.length > 0) return "matched";
                    if (isQueueActive || bwQuery.isLoading) return "enriching";
                    return decodeMutation.data?.decodeStatus;
                  })()}
                  siblings={decodeMutation.data?.siblings || []}
                  knownChassis={decodeMutation.data?.knownChassis || bwData?.vehicle?.chassis || null}
                  bwLoading={bwQuery.isLoading}
                  bwSource={enrichSource as ("bimmerwork" | "mdecoder" | null)}
                  queueCountdown={countdown}
                  queueAttempts={queueQuery.data?.attempts ?? 0}
                  enrichmentSource={bwQuery.data?.enrichmentSource || null}
                />
              )}
              {activeTab === "options" && (
                bwQuery.isLoading ? (
                  <div className="space-y-3">
                    {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
                  </div>
                ) : <OptionsTab options={bwData?.options || []} enrichmentSource={bwQuery.data?.enrichmentSource || null} coverage={bwQuery.data?.coverage || null} />
              )}
              {activeTab === "images" && (
                bwQuery.isLoading ? (
                  <Skeleton className="h-64 rounded-lg" />
                ) : <ImagesTab images={bwData?.images || null} modelName={modelName} enrichmentSource={bwQuery.data?.enrichmentSource || null} />
              )}
              {activeTab === "manuals" && (
                bwQuery.isLoading ? (
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}
                  </div>
                ) : <ManualsTab manuals={bwData?.manuals || []} enrichmentSource={bwQuery.data?.enrichmentSource || null} />
              )}
              {activeTab === "servicing" && (
                <div className="space-y-3" data-testid="servicing-tab-body">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs text-muted-foreground">
                      {t.servicing?.tabIntro ?? "Fluid capacities and OEM filter part numbers for routine BMW servicing."}
                    </p>
                    {decoded?.vin && (
                      <Link
                        href={localize(`/servicing/${decoded.vin}`)}
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                        data-testid="link-open-servicing-page"
                      >
                        {t.servicing?.openCta ?? "Open Quick Servicing Info"} <ChevronRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                  <ServicingBody vin={decoded?.vin || null} hideHeader />
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      <section className="border-t pt-6 mt-6 space-y-3" data-testid="section-vin-intro">
        <h2 className="text-xl font-bold">{t.vinSeo.introH1}</h2>
        <p className="text-sm text-muted-foreground" data-testid="text-vin-intro">
          {t.vinSeo.introBody}
        </p>
      </section>

      <section className="space-y-3" data-testid="section-vin-what-you-get">
        <h2 className="text-lg font-semibold">{t.vinSeo.whatYouGetHeading}</h2>
        <p className="text-sm text-muted-foreground">{t.vinSeo.whatYouGetIntro}</p>
        <ul className="list-disc pl-5 text-sm space-y-1">
          {t.vinSeo.whatYouGetItems.map((item, i) => (
            <li key={i} data-testid={`vin-what-you-get-${i}`}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-3" data-testid="section-vin-how-it-works">
        <h2 className="text-lg font-semibold">{t.vinSeo.howItWorksHeading}</h2>
        <p className="text-sm text-muted-foreground">{t.vinSeo.howItWorksIntro}</p>
        <ol className="list-decimal pl-5 text-sm space-y-2">
          {t.vinSeo.howItWorksSteps.map((s, i) => (
            <li key={i} data-testid={`vin-how-step-${i}`}>
              <h3 className="inline font-medium">{s.name}.</h3>{" "}
              <span className="text-muted-foreground">{s.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-2" data-testid="section-vin-bimmerwork">
        <h2 className="text-lg font-semibold">{t.vinSeo.bimmerWorkHeading}</h2>
        <p className="text-sm text-muted-foreground">{t.vinSeo.bimmerWorkBody}</p>
      </section>

      <section className="space-y-2" data-testid="section-vin-coverage">
        <h2 className="text-lg font-semibold">{t.vinSeo.coverageHeading}</h2>
        <p className="text-sm text-muted-foreground">{t.vinSeo.coverageBody}</p>
        <div className="pt-2 text-sm" data-testid="section-vin-hub-links">
          <h3 className="font-medium mb-1">Browse OEM parts by chassis</h3>
          <p className="text-muted-foreground">
            Popular BMW chassis hubs:{" "}
            {["e46", "e90", "e92", "f10", "f30", "f80", "g20", "g80", "g82"].map((c, i, arr) => (
              <span key={c}>
                <Link href={localize(`/chassis/${c}`)} className="text-primary hover:underline" data-testid={`link-vin-chassis-${c}`}>
                  {c.toUpperCase()}
                </Link>
                {i < arr.length - 1 ? ", " : ""}
              </span>
            ))}
            .
          </p>
          <h3 className="font-medium mt-3 mb-1">Browse OEM parts by series</h3>
          <p className="text-muted-foreground">
            BMW series hubs:{" "}
            {["1", "2", "3", "4", "5", "6", "7", "8", "x", "z", "m", "i"].map((s, i, arr) => (
              <span key={s}>
                <Link href={localize(`/series/${s}`)} className="text-primary hover:underline" data-testid={`link-vin-series-${s}`}>
                  {s.toUpperCase()}
                </Link>
                {i < arr.length - 1 ? ", " : ""}
              </span>
            ))}
            .
          </p>
        </div>
      </section>

      <section className="space-y-3" data-testid="section-vin-faq">
        <h2 className="text-lg font-semibold">{t.vinSeo.faqHeading}</h2>
        <div className="space-y-3">
          {t.vinSeo.faqs.map((f, i) => (
            <div key={i} className="border rounded-md p-3" data-testid={`vin-faq-item-${i}`}>
              <h3 className="text-sm font-semibold" data-testid={`vin-faq-question-${i}`}>{f.q}</h3>
              <p className="text-sm text-muted-foreground mt-1" data-testid={`vin-faq-answer-${i}`}>{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {decodedVin && decodedVin.length === 17 && (
        <AiFaqSection
          pageType="vin"
          pageKey={decodedVin.slice(-7)}
          locale={activeLocale.code}
        />
      )}
    </div>
  );
}
