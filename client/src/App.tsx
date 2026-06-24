import { lazy, Suspense, useEffect, useRef } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  detectBrowserLocale,
  getStoredLocale,
  isBmvVinHost,
  isLocalizablePath,
  LOCALIZED_PATHS,
  splitLocaleFromPath,
  storeLocale,
  swapLocaleOnPath,
} from "@/lib/locale";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/lib/auth";
import Home from "@/pages/Home";
import { Link } from "wouter";
import { LogIn, LogOut, Shield, User, Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UniversalSearch } from "@/components/UniversalSearch";

const CarDetail = lazy(() => import("@/pages/CarDetail"));
const Search = lazy(() => import("@/pages/Search"));
const PartDetail = lazy(() => import("@/pages/PartDetail"));
const Login = lazy(() => import("@/pages/Login"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Admin = lazy(() => import("@/pages/Admin"));
const RealoemBackfill = lazy(() => import("@/pages/RealoemBackfill"));
const BackupRestore = lazy(() => import("@/pages/BackupRestore"));
const PartFinder = lazy(() => import("@/pages/PartFinder"));
const VinDecoder = lazy(() => import("@/pages/VinDecoder"));
const Servicing = lazy(() => import("@/pages/Servicing"));
const BmwModels = lazy(() => import("@/pages/BmwModels"));
const MyCars = lazy(() => import("@/pages/MyCars"));
const SeriesLanding = lazy(() => import("@/pages/SeriesLanding"));
const ChassisLanding = lazy(() => import("@/pages/ChassisLanding"));
const About = lazy(() => import("@/pages/About"));
const Friends = lazy(() => import("@/pages/Friends"));
const ApiDocs = lazy(() => import("@/pages/ApiDocs"));
const NotFound = lazy(() => import("@/pages/not-found"));
const PhotoQuote = lazy(() => import("@/pages/PhotoQuote"));
const GuidePage = lazy(() => import("@/pages/GuidePage"));
const ComparePage = lazy(() => import("@/pages/ComparePage"));
const DataPage = lazy(() => import("@/pages/DataPage"));
const ChassisPartPage = lazy(() => import("@/pages/ChassisPartPage"));
const ModelHubPage = lazy(() => import("@/pages/ModelHubPage"));

// bmv.vin vanity-host SPA pages (Task #96, T008). Each component hydrates
// over the SSR markup produced by server/seo/bmv-vin-pages.ts so links work
// after navigation and the VIN input form is interactive.
const BmvVinDecoderHome     = lazy(() => import("@/pages/bmv-vin").then(m => ({ default: m.DecoderHome })));
const BmvVinBrandDecoderHub = lazy(() => import("@/pages/bmv-vin").then(m => ({ default: m.BrandDecoderHub })));
const BmvVinFacetIndex      = lazy(() => import("@/pages/bmv-vin").then(m => ({ default: m.FacetIndex })));
const BmvVinFacetHub        = lazy(() => import("@/pages/bmv-vin").then(m => ({ default: m.FacetHub })));
const BmvVinGuideIndex      = lazy(() => import("@/pages/bmv-vin").then(m => ({ default: m.GuideIndex })));
const BmvVinGuideDetail     = lazy(() => import("@/pages/bmv-vin").then(m => ({ default: m.GuideDetail })));
const BmvVinGlossaryIndex   = lazy(() => import("@/pages/bmv-vin").then(m => ({ default: m.GlossaryIndex })));
const BmvVinGlossaryTerm    = lazy(() => import("@/pages/bmv-vin").then(m => ({ default: m.GlossaryTerm })));
const BmvVinToolPage        = lazy(() => import("@/pages/bmv-vin").then(m => ({ default: m.VinToolPage })));
const BmvVinModelPage       = lazy(() => import("@/pages/bmv-vin").then(m => ({ default: m.ModelVinPage })));
const BmvVinComparePage     = lazy(() => import("@/pages/bmv-vin").then(m => ({ default: m.ComparePage })));
const BmvVinDataPage        = lazy(() => import("@/pages/bmv-vin").then(m => ({ default: m.DataPage })));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-32">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function UserMenu() {
  const { user, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();

  if (!isAuthenticated) {
    return (
      <Link href="/login" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-login">
        <LogIn className="w-3.5 h-3.5" />
        Sign In
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {user?.role === "admin" && (
        <Link href="/admin" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-admin">
          <Shield className="w-3.5 h-3.5" />
          Admin
        </Link>
      )}
      <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid="text-username">
        <User className="w-3 h-3" />
        {user?.username}
      </span>
      <button
        onClick={async () => { await logout(); navigate("/"); }}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        data-testid="button-logout"
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// Locale-prefixed URL routes (Task #32). Each supported non-English locale
// gets its own `/{prefix}/...` entry that renders the same page component;
// pages derive the active locale from the path via splitLocaleFromPath.
// We register the locale routes BEFORE the canonical English ones so
// wouter's first-match-wins picks the more specific prefixed path.
// English remains at the un-prefixed root.
//
// Task #37 broadened this from part-detail-only to all visitor-facing pages
// so the header language switcher can rewrite *any* URL (e.g. /search ->
// /de/search) without landing on NotFound. Authenticated/admin routes
// (/login, /admin, /reset-password, etc.) are intentionally excluded —
// they have no localized counterpart.
const LOCALE_PREFIXES = ["de", "fr", "es", "it", "zh", "ko", "es-mx", "en-za", "pt-br", "ru"];

// Component map keyed by the same path strings exported from lib/locale.ts.
// Adding a new localized route is a two-step change: add the path to
// LOCALIZED_PATHS in locale.ts, then add the component here. TypeScript
// enforces that every LOCALIZED_PATHS entry has a matching component.
const LOCALIZED_ROUTE_COMPONENTS: Record<typeof LOCALIZED_PATHS[number], React.ComponentType<any>> = {
  "/": Home,
  "/car/:slug": CarDetail,
  "/part/:partNumberClean": PartDetail,
  "/search": Search,
  "/part-finder": PartFinder,
  "/vin": VinDecoder,
  "/vin/:vin": VinDecoder,
  "/servicing": Servicing,
  "/servicing/:vin": Servicing,
  "/models": BmwModels,
  "/my-cars": MyCars,
  "/series/:seriesSlug": SeriesLanding,
  "/chassis/:chassisCode": ChassisLanding,
  "/about": About,
  "/recommended-sites": Friends,
};

// True when the SPA is running on the bmv.vin vanity host (or its www
// alias). On that host, "/" and "/<VIN>" both serve the VIN decoder
// directly — bmv.vin is a single-purpose mirror of the /vin tool.
//
// HARD DOMAIN SPLIT (Task #96 review fix): bmv.vin is a single-purpose
// VIN-decoder + educational surface. Catalog (/car, /part, /search,
// /models, /part-finder, /series, /about, /friends), localized catalog
// roots, and auth/admin (/login, /admin, /reset-password, /my-cars) all
// live ONLY on bmv.parts. The host-rewrite middleware in server/index.ts
// 301-redirects those paths over the host boundary, so by the time a
// React route would render here the URL is already a bmv.vin SEO surface
// or a bare VIN. We therefore register only:
//   - the bmv.vin SEO routes (decoder home, brand decoders, facet hubs,
//     guide library, glossary)
//   - the bare-VIN catch-all "/:vin" → VinDecoder
//   - NotFound for anything else (e.g. an explicit /something-random)
function VinHostRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {/*
          Decoder home + content surfaces (Task #96, T008). Order matters:
          specific bmv.vin routes win first, then the catch-all /:vin
          vanity route, then NotFound. The 17-character VIN segment is
          bare so /decoder, /chassis, /year, /plant, /market, /paint,
          /option, /guide, /glossary all match the new pages instead of
          falling through to the VIN decoder.
        */}
        <Route path="/" component={BmvVinDecoderHome} />
        <Route path="/decoder/:brand" component={BmvVinBrandDecoderHub} />
        <Route path="/chassis" component={BmvVinFacetIndex} />
        <Route path="/chassis/:value" component={BmvVinFacetHub} />
        <Route path="/year" component={BmvVinFacetIndex} />
        <Route path="/year/:value" component={BmvVinFacetHub} />
        <Route path="/plant" component={BmvVinFacetIndex} />
        <Route path="/plant/:value" component={BmvVinFacetHub} />
        <Route path="/market" component={BmvVinFacetIndex} />
        <Route path="/market/:value" component={BmvVinFacetHub} />
        <Route path="/paint" component={BmvVinFacetIndex} />
        <Route path="/paint/:value" component={BmvVinFacetHub} />
        <Route path="/option" component={BmvVinFacetIndex} />
        <Route path="/option/:value" component={BmvVinFacetHub} />
        <Route path="/guide" component={BmvVinGuideIndex} />
        <Route path="/guide/:slug" component={BmvVinGuideDetail} />
        <Route path="/glossary" component={BmvVinGlossaryIndex} />
        <Route path="/glossary/:term" component={BmvVinGlossaryTerm} />
        {/* Template A: VIN tool landing pages — exact slugs must come before /bmw-:rest */}
        <Route path="/bmw-vin-decoder" component={BmvVinToolPage} />
        <Route path="/bmw-build-sheet-lookup" component={BmvVinToolPage} />
        <Route path="/bmw-paint-code-lookup" component={BmvVinToolPage} />
        <Route path="/bmw-production-date-lookup" component={BmvVinToolPage} />
        <Route path="/bmw-engine-code-lookup" component={BmvVinToolPage} />
        <Route path="/bmw-options-lookup" component={BmvVinToolPage} />
        <Route path="/bmw-plant-code-lookup" component={BmvVinToolPage} />
        <Route path="/bmw-model-year-lookup" component={BmvVinToolPage} />
        {/* Templates E + F: comparison and statistics pages */}
        <Route path="/compare/:slug" component={BmvVinComparePage} />
        <Route path="/data/:slug" component={BmvVinDataPage} />
        {/* Template B: /bmw-{chassis}-vin-decoder — after explicit tool slugs */}
        <Route path="/bmw-:rest" component={BmvVinModelPage} />
        <Route path="/:vin" component={VinDecoder} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function Router() {
  if (isBmvVinHost()) return <VinHostRouter />;
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {LOCALE_PREFIXES.flatMap(prefix =>
          LOCALIZED_PATHS.map(path => {
            const localized = path === "/" ? `/${prefix}` : `/${prefix}${path}`;
            return (
              <Route
                key={`${prefix}${path}`}
                path={localized}
                component={LOCALIZED_ROUTE_COMPONENTS[path]}
              />
            );
          })
        )}
        {LOCALIZED_PATHS.map(path => (
          <Route key={path} path={path} component={LOCALIZED_ROUTE_COMPONENTS[path]} />
        ))}
        <Route path="/friends"><Redirect to="/recommended-sites" /></Route>
        <Route path="/login" component={Login} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/admin" component={Admin} />
        <Route path="/admin/realoem-backfill" component={RealoemBackfill} />
        <Route path="/admin/backups/restore/:id" component={BackupRestore} />
        <Route path="/guides/:slug" component={GuidePage} />
        <Route path="/compare/:slug" component={ComparePage} />
        <Route path="/data/:slug" component={DataPage} />
        <Route path="/parts/:chassis/:category" component={ChassisPartPage} />
        <Route path="/hub/:chassis" component={ModelHubPage} />
        <Route path="/quote" component={PhotoQuote} />
        <Route path="/api-docs" component={ApiDocs} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

// Run-once hook that redirects first-time visitors to their preferred locale.
// Priority: stored localStorage preference > navigator.languages match. We
// only redirect when the URL has no explicit locale prefix (i.e. the visitor
// landed on the English root) so that deep links to /de/part/... are never
// rewritten out from under the user.
function useFirstVisitLocaleRedirect() {
  const [location, navigate] = useLocation();
  const ranRef = useRef(false);
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    // bmv.vin is single-locale by contract (one canonical URL per page,
    // no /<locale>/ prefixes). Body translation is driven server-side by
    // Accept-Language; never rewrite the URL on the vanity host.
    if (isBmvVinHost()) return;
    const { locale: active, pathWithoutLocale } = splitLocaleFromPath(location);
    if (active.prefix !== "") return;
    if (!isLocalizablePath(pathWithoutLocale)) return;
    const stored = getStoredLocale();
    const target = stored ?? detectBrowserLocale();
    if (!target || target.prefix === "") return;
    if (!stored) storeLocale(target);
    navigate(swapLocaleOnPath(location, target), { replace: true });
  }, [location, navigate]);
}

function AppContent() {
  useFirstVisitLocaleRedirect();
  const style = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/*
            Topbar — single horizontal rule under a paper-toned bar. The
            BMV brand pack puts the wordmark in the sidebar instead of
            here so the topbar's vertical real estate goes to the
            universal search input (~540px). Theme toggle sits next to
            the language switcher.
          */}
          <header className="flex items-center gap-3 px-4 h-12 border-b border-border bg-background shrink-0 z-10">
            <SidebarTrigger data-testid="button-sidebar-toggle" className="-ml-1" />
            <div className="h-5 w-px bg-border" />
            <UniversalSearch className="ml-1 h-7" />
            <div className="ml-auto flex items-center gap-3">
              <ThemeToggle />
              <LanguageSwitcher />
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}
