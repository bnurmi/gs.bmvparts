import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { splitLocaleFromPath, useLocalizedHref, isBmvVinHost } from "@/lib/locale";
import { BMV_PARTS_BASE } from "@shared/bmv-vin/links";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarHeader, SidebarFooter,
  SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  LayoutDashboard, Search, CheckCircle2, Clock, AlertCircle,
  Loader2, Ban, Camera, KeyRound, Database, ChevronRight, CarFront, Layers,
  Info, Droplets, ChevronDown, Terminal,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { Car } from "@shared/schema";
import {
  groupCars, getGroupDef, GROUP_ORDER, type CarGroupKey,
  groupByChassisVariants, type ChassisVariantGroup,
} from "@/lib/car-groups";
import { useState, useMemo, useEffect, Fragment } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger,
} from "@/components/ui/drawer";

// Renders as a wouter <Link> (SPA nav) on bmv.parts, or as a plain <a>
// (hard cross-host navigation to bmv.parts) when on bmv.vin. This lets
// catalog nav items work correctly on both hosts without changing the
// bmv.parts SPA experience.
function CatalogLink({
  isBmvVin,
  relativePath,
  absoluteHref,
  children,
  ...rest
}: {
  isBmvVin: boolean;
  relativePath: string;
  absoluteHref: string;
  children: React.ReactNode;
  [key: string]: unknown;
}) {
  if (isBmvVin) {
    return <a href={absoluteHref} {...rest}>{children}</a>;
  }
  return <Link href={relativePath} {...rest}>{children}</Link>;
}

const statusIcon = {
  idle: <Clock className="w-3 h-3 text-muted-foreground" />,
  running: <Loader2 className="w-3 h-3 text-primary animate-spin" />,
  complete: <CheckCircle2 className="w-3 h-3 text-green-500" />,
  error: <AlertCircle className="w-3 h-3 text-destructive" />,
  unavailable: <Ban className="w-3 h-3 text-muted-foreground" />,
  cancelled: <AlertCircle className="w-3 h-3 text-muted-foreground" />,
};

// Per BMV brand spec (Task #69): collapse the M group to the top-8 most
// part-rich variants by default with a "Show all N →" link at the bottom
// pointing to the chassis/series landing page. Other groups still expand
// fully because they're already short. The whole section remains
// collapsible, with auto-open when a car inside it is the current page.
const M_TOP_N = 8;

// Chassis with more than this many variants get a drawer picker.
const DRAWER_THRESHOLD = 6;

// ── Variant picker drawer (for chassis with > 6 variants) ───────────────────

function VariantPickerDrawer({
  group,
  currentPath,
  activeVariantId,
}: {
  group: ChassisVariantGroup<Car>;
  currentPath: string;
  activeVariantId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const localize = useLocalizedHref();

  const filtered = useMemo(() => {
    if (!query.trim()) return group.cars;
    const q = query.toLowerCase();
    return group.cars.filter(c => (c.displayName || "").toLowerCase().includes(q));
  }, [group.cars, query]);

  const activeVariant = group.cars.find(c => (c.slug || String(c.id)) === activeVariantId);
  const triggerLabel = activeVariant
    ? `${group.label}: ${activeVariant.displayName}`
    : group.label;
  const isChassisActive = group.cars.some(
    c => currentPath === `/car/${c.slug || c.id}`
  );

  return (
    <Drawer open={open} onOpenChange={setOpen} direction="bottom">
      <DrawerTrigger asChild>
        <SidebarMenuButton
          isActive={isChassisActive}
          data-testid={`trigger-chassis-drawer-${group.chassis}`}
          className="w-full"
        >
          <div className="flex items-center gap-2 w-full min-w-0">
            <span className="flex-1 truncate text-sm">{triggerLabel}</span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] font-mono text-sidebar-foreground/50 tabular-nums">
                {group.cars.length}
              </span>
              <ChevronDown className="w-3 h-3 text-sidebar-foreground/50" />
            </div>
          </div>
        </SidebarMenuButton>
      </DrawerTrigger>
      <DrawerContent data-testid={`drawer-chassis-${group.chassis}`}>
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-sm font-mono">{group.label}</DrawerTitle>
          <Input
            autoFocus
            placeholder="Filter variants…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="mt-2 h-8 text-sm"
            data-testid={`input-variant-filter-${group.chassis}`}
          />
        </DrawerHeader>
        <div className="overflow-y-auto max-h-[55vh] px-4 pb-6">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No variants match</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filtered.map(car => {
                const isActive = currentPath === `/car/${car.slug || car.id}`;
                return (
                  <DrawerClose asChild key={car.id}>
                    <Link
                      href={localize(`/car/${car.slug || car.id}`)}
                      data-testid={`link-variant-${car.id}`}
                      className={`flex items-center justify-between px-3 py-2 rounded text-sm transition-colors
                        ${isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
                        }`}
                      onClick={() => setOpen(false)}
                    >
                      <span className="flex-1 truncate">{car.displayName}</span>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {(car.totalParts ?? 0) > 0 && (
                          <span className="text-[10px] font-mono text-sidebar-foreground/50 tabular-nums">
                            {(car.totalParts ?? 0).toLocaleString()}
                          </span>
                        )}
                        {statusIcon[car.scrapeStatus as keyof typeof statusIcon] || statusIcon.idle}
                      </div>
                    </Link>
                  </DrawerClose>
                );
              })}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ── Inline chassis accordion row (for chassis with 1–6 variants) ────────────

const LCI_INDENT_CLASS = "ml-3 border-l border-sidebar-border/40 pl-1.5";

function ChassisAccordionRow({
  group,
  currentPath,
  defaultOpen,
  indented = false,
}: {
  group: ChassisVariantGroup<Car>;
  currentPath: string;
  defaultOpen: boolean;
  indented?: boolean;
}) {
  const localize = useLocalizedHref();

  // All hooks must be called unconditionally — before any early return.
  const isChassisActive = group.cars.some(c => currentPath === `/car/${c.slug || c.id}`);
  const [open, setOpen] = useState(defaultOpen);

  // Auto-expand when navigation lands on a car in this chassis.
  // We only force-open (never force-close) so manual user toggles are preserved.
  useEffect(() => {
    if (isChassisActive) setOpen(true);
  }, [isChassisActive]);

  const isSingle = group.cars.length === 1;

  // Single-variant chassis → direct link.
  // Label uses the chassis code (group.label) so LCI vs pre-LCI is always
  // distinct (e.g. "E90N — LCI" vs "E90"), with the variant name as a
  // secondary subtitle for context.
  if (isSingle) {
    const car = group.cars[0];
    const isActive = currentPath === `/car/${car.slug || car.id}`;
    const button = (
      <SidebarMenuButton
        asChild
        isActive={isActive}
        data-testid={`link-car-${car.id}`}
      >
        <Link href={localize(`/car/${car.slug || car.id}`)}>
          <div className="flex flex-col w-full min-w-0">
            <div className="flex items-center gap-2 w-full min-w-0">
              <span className="flex-1 truncate text-sm">{group.label}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {(car.totalParts ?? 0) > 0 && (
                  <span className="text-[10.5px] font-mono text-sidebar-foreground/50 tabular-nums">
                    {(car.totalParts ?? 0).toLocaleString()}
                  </span>
                )}
                {statusIcon[car.scrapeStatus as keyof typeof statusIcon] || statusIcon.idle}
              </div>
            </div>
            <span className="text-[10px] text-sidebar-foreground/50 truncate leading-tight">
              {car.displayName}
            </span>
          </div>
        </Link>
      </SidebarMenuButton>
    );
    return (
      <SidebarMenuItem>
        {indented ? <div className={LCI_INDENT_CLASS}>{button}</div> : button}
      </SidebarMenuItem>
    );
  }

  // Multi-variant chassis → collapsible accordion
  const collapsible = (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <SidebarMenuButton
          isActive={isChassisActive && !open}
          data-testid={`trigger-chassis-${group.chassis}`}
          className="w-full"
        >
          <div className="flex items-center gap-2 w-full min-w-0">
            <span className="flex-1 truncate text-sm">{group.label}</span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] font-mono text-sidebar-foreground/50 tabular-nums">
                {group.cars.length}
              </span>
              <ChevronRight className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} />
            </div>
          </div>
        </SidebarMenuButton>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {group.cars.map(car => {
            const isActive = currentPath === `/car/${car.slug || car.id}`;
            return (
              <SidebarMenuSubItem key={car.id}>
                <SidebarMenuSubButton
                  asChild
                  isActive={isActive}
                  data-testid={`link-car-${car.id}`}
                >
                  <Link href={localize(`/car/${car.slug || car.id}`)}>
                    <div className="flex items-center gap-2 w-full min-w-0">
                      <span className="flex-1 truncate text-sm">{car.displayName}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {(car.totalParts ?? 0) > 0 && (
                          <span className="text-[10px] font-mono text-sidebar-foreground/50 tabular-nums">
                            {(car.totalParts ?? 0).toLocaleString()}
                          </span>
                        )}
                        {statusIcon[car.scrapeStatus as keyof typeof statusIcon] || statusIcon.idle}
                      </div>
                    </div>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
  return (
    <SidebarMenuItem>
      {indented ? <div className={LCI_INDENT_CLASS}>{collapsible}</div> : collapsible}
    </SidebarMenuItem>
  );
}

// ── Car group section ────────────────────────────────────────────────────────

function CarGroupSection({ groupKey, cars, currentPath }: {
  groupKey: CarGroupKey;
  cars: Car[];
  currentPath: string;
}) {
  const t = useT();
  const def = getGroupDef(groupKey);
  const hasActiveCar = cars.some(car => currentPath === `/car/${car.slug || car.id}`);
  const [open, setOpen] = useState(hasActiveCar || groupKey === "m");
  const [showAllInGroup, setShowAllInGroup] = useState(false);

  // Auto-expand section when navigation lands on a car inside it.
  // Only force-open (never force-close) so user-collapsed sections stay
  // collapsed until navigating to a car in them.
  useEffect(() => {
    if (hasActiveCar) setOpen(true);
  }, [hasActiveCar]);

  // Sort by total parts so the M default top-8 prioritises the
  // catalogs with the most depth (M3, M5, M2, …) rather than
  // alphabetical order which buries the popular chassis.
  const sorted = [...cars].sort((a, b) => (b.totalParts ?? 0) - (a.totalParts ?? 0));
  const isMGroup = groupKey === "m";
  const displayCars = isMGroup && !showAllInGroup ? sorted.slice(0, M_TOP_N) : sorted;
  const hiddenCount = sorted.length - displayCars.length;

  // Group the displayed cars into chassis/variant groups.
  // For the M group we pass the already-sliced `displayCars` so the top-N
  // limit is respected at the chassis level too.
  const chassisGroups = useMemo(
    () => groupByChassisVariants(displayCars),
    [displayCars],
  );

  // Derive active variant slug for drawer pre-labelling
  const activeSlug = currentPath.startsWith("/car/")
    ? currentPath.replace("/car/", "")
    : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarGroup>
        <CollapsibleTrigger className="w-full">
          <SidebarGroupLabel className="text-[10.5px] font-mono tracking-label text-sidebar-foreground/60 uppercase px-2 cursor-pointer hover:text-sidebar-foreground transition-colors flex items-center justify-between w-full">
            <span>{def.title}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono normal-case tracking-normal opacity-70 tabular-nums">{cars.length}</span>
              <ChevronRight className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} />
            </div>
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {chassisGroups.map(group => {
                const isLarge = group.cars.length > DRAWER_THRESHOLD;
                const isChassisActive = group.cars.some(c => currentPath === `/car/${c.slug || c.id}`);
                const lciGroup = group.lciGroup;

                const baseRow = isLarge ? (
                  <SidebarMenuItem>
                    <VariantPickerDrawer
                      group={group}
                      currentPath={currentPath}
                      activeVariantId={activeSlug}
                    />
                  </SidebarMenuItem>
                ) : (
                  <ChassisAccordionRow
                    group={group}
                    currentPath={currentPath}
                    defaultOpen={isChassisActive}
                  />
                );

                if (!lciGroup) {
                  return (
                    <Fragment key={`chassis-${group.chassis}`}>
                      {baseRow}
                    </Fragment>
                  );
                }

                const lciIsLarge = lciGroup.cars.length > DRAWER_THRESHOLD;
                const lciIsActive = lciGroup.cars.some(c => currentPath === `/car/${c.slug || c.id}`);

                return (
                  <Fragment key={`chassis-${group.chassis}`}>
                    {baseRow}
                    {lciIsLarge ? (
                      <SidebarMenuItem>
                        <div className={LCI_INDENT_CLASS}>
                          <VariantPickerDrawer
                            group={lciGroup}
                            currentPath={currentPath}
                            activeVariantId={activeSlug}
                          />
                        </div>
                      </SidebarMenuItem>
                    ) : (
                      <ChassisAccordionRow
                        group={lciGroup}
                        currentPath={currentPath}
                        defaultOpen={lciIsActive}
                        indented
                      />
                    )}
                  </Fragment>
                );
              })}
              {isMGroup && hiddenCount > 0 && (
                <SidebarMenuItem>
                  <button
                    type="button"
                    onClick={() => setShowAllInGroup(true)}
                    className="w-full text-left px-2 py-1.5 text-[11px] font-mono tracking-mono text-bmv-accent hover:text-bmv-hover transition-colors"
                    data-testid="button-show-all-m"
                  >
                    {t.topbar.showAllModels(sorted.length)}
                  </button>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

export function AppSidebar() {
  const t = useT();
  const [location] = useLocation();
  const { isAuthenticated } = useAuth();
  const localize = useLocalizedHref();
  const { pathWithoutLocale } = splitLocaleFromPath(location);
  const isBmvVin = isBmvVinHost();
  const { data: cars = [] } = useQuery<Car[]>({
    queryKey: ["/api/cars"],
    refetchInterval: 3000,
  });

  const { data: stats } = useQuery<{ totalCars: number; scrapedCars: number; totalParts: number }>({
    queryKey: ["/api/stats"],
  });
  const carsByGroup = groupCars(cars);
  const totalParts = stats?.totalParts ?? 0;
  const scrapedCount = cars.filter(c => c.scrapeStatus === "complete").length;

  return (
    <Sidebar>
      {/*
        Sidebar header — uses the BMV header SVG wordmark instead of
        the legacy trimmed PNG. We swap the dark/light variants based
        on the resolved theme so the wordmark always reads against the
        sidebar's deep ink background. Both files live in
        client/public/logos/ and are served as static assets.
      */}
      <SidebarHeader className="px-3 py-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="flex-1 min-w-0">
            <img
              src="/logos/bmv-logo-header-dark.svg"
              alt="BMV.parts"
              className="h-7 w-auto"
              data-testid="img-sidebar-logo"
            />
            {/*
              BMV brand line. Previously this fell back to "Offline
              Database" whenever totalParts was 0 (i.e. before /api/stats
              had returned). Visitors read that as "the site is offline"
              even though it was just a slow-loading status. We now
              render the parts count when available and a neutral brand
              tagline otherwise — never a status word.
            */}
            <div className="text-[10.5px] font-mono tracking-mono text-sidebar-foreground/50 mt-1">
              {totalParts > 0 ? t.sidebar.partsCount(totalParts.toLocaleString()) : t.sidebar.tagline}
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="py-1">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathWithoutLocale === "/"} data-testid="link-home">
                  <CatalogLink isBmvVin={isBmvVin} relativePath={localize("/")} absoluteHref={BMV_PARTS_BASE + localize("/")}>
                    <LayoutDashboard className="w-4 h-4" />
                    <span>{t.sidebar.dashboard}</span>
                  </CatalogLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathWithoutLocale === "/search"} data-testid="link-search">
                  <CatalogLink isBmvVin={isBmvVin} relativePath={localize("/search")} absoluteHref={BMV_PARTS_BASE + localize("/search")}>
                    <Search className="w-4 h-4" />
                    <span>{t.sidebar.searchParts}</span>
                    {totalParts > 0 && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {totalParts.toLocaleString()}
                      </Badge>
                    )}
                  </CatalogLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathWithoutLocale === "/part-finder"} data-testid="link-part-finder">
                  <CatalogLink isBmvVin={isBmvVin} relativePath={localize("/part-finder")} absoluteHref={BMV_PARTS_BASE + localize("/part-finder")}>
                    <Camera className="w-4 h-4" />
                    <span>{t.sidebar.partFinder}</span>
                    <Badge className="ml-auto text-[10px] font-mono tracking-mono bg-bmv-accent text-bmv-on hover:bg-bmv-hover border-0 rounded-none px-1.5 py-0">{t.sidebar.aiBadge}</Badge>
                  </CatalogLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathWithoutLocale === "/vin"} data-testid="link-vin-decoder">
                  <Link href={localize("/vin")}>
                    <KeyRound className="w-4 h-4" />
                    <span>{t.sidebar.vinDecoder}</span>
                    <Badge className="ml-auto text-[10px] font-mono tracking-mono bg-bmv-accent text-bmv-on hover:bg-bmv-hover border-0 rounded-none px-1.5 py-0">{t.sidebar.bmwBadge}</Badge>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathWithoutLocale.startsWith("/servicing")} data-testid="link-servicing">
                  <CatalogLink isBmvVin={isBmvVin} relativePath={localize("/servicing")} absoluteHref={BMV_PARTS_BASE + localize("/servicing")}>
                    <Droplets className="w-4 h-4" />
                    <span>{t.sidebar.servicing ?? "Servicing"}</span>
                  </CatalogLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathWithoutLocale === "/models"} data-testid="link-models">
                  <CatalogLink isBmvVin={isBmvVin} relativePath={localize("/models")} absoluteHref={BMV_PARTS_BASE + localize("/models")}>
                    <Database className="w-4 h-4" />
                    <span>{t.sidebar.modelReference}</span>
                  </CatalogLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathWithoutLocale === "/about"} data-testid="link-about">
                  <CatalogLink isBmvVin={isBmvVin} relativePath={localize("/about")} absoluteHref={BMV_PARTS_BASE + localize("/about")}>
                    <Info className="w-4 h-4" />
                    <span>{t.sidebar.about}</span>
                  </CatalogLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathWithoutLocale === "/recommended-sites"} data-testid="link-recommended-sites">
                  <CatalogLink isBmvVin={isBmvVin} relativePath={localize("/recommended-sites")} absoluteHref={BMV_PARTS_BASE + localize("/recommended-sites")}>
                    <Layers className="w-4 h-4" />
                    <span>{t.sidebar.recommendedSites}</span>
                  </CatalogLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathWithoutLocale === "/api-docs"} data-testid="link-api-docs">
                  <CatalogLink isBmvVin={isBmvVin} relativePath="/api-docs" absoluteHref={BMV_PARTS_BASE + "/api-docs"}>
                    <Terminal className="w-4 h-4" />
                    <span>API Docs</span>
                  </CatalogLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {isAuthenticated && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathWithoutLocale === "/my-cars"} data-testid="link-my-cars">
                    <Link href={localize("/my-cars")}>
                      <CarFront className="w-4 h-4" />
                      <span>{t.sidebar.myCars}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {GROUP_ORDER.map(g =>
          (carsByGroup[g]?.length ?? 0) > 0 ? (
            <CarGroupSection key={g} groupKey={g} cars={carsByGroup[g]} currentPath={pathWithoutLocale} />
          ) : null
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-3 py-2">
        <div className="text-xs text-muted-foreground">
          {t.sidebar.syncedSummary(scrapedCount, cars.length)}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
