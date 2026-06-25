import { Component, type ErrorInfo, type ReactNode } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/lib/auth";
import { isBmvVinHost, useLocalizedHref } from "@/lib/locale";
import { HelmetProvider } from "react-helmet-async";
import { Link } from "wouter";
import { CatalogStatusChip } from "@/components/CatalogStatusChip";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UniversalSearch } from "@/components/UniversalSearch";
import Home from "@/pages/Home";
import CarDetail from "@/pages/CarDetail";
import Search from "@/pages/Search";
import PartDetail from "@/pages/PartDetail";
import VinDecoder from "@/pages/VinDecoder";
import Login from "@/pages/Login";
import Admin from "@/pages/Admin";
import About from "@/pages/About";
import ApiDocs from "@/pages/ApiDocs";
import Friends from "@/pages/Friends";
import Servicing from "@/pages/Servicing";
import BmwModels from "@/pages/BmwModels";
import ModelHubPage from "@/pages/ModelHubPage";
import SeriesLanding from "@/pages/SeriesLanding";
import ChassisLanding from "@/pages/ChassisLanding";
import PartFinder from "@/pages/PartFinder";
import MyCars from "@/pages/MyCars";
import BackupRestore from "@/pages/BackupRestore";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "@/pages/not-found";
import {
  DecoderHome,
  BrandDecoderHub,
  FacetHub,
  GuideIndex,
  GuideDetail,
  GlossaryIndex,
  GlossaryTerm,
  ComparePage as BmvVinComparePage,
  DataPage as BmvVinDataPage,
  VinToolPage,
  ModelVinPage,
} from "@/pages/bmv-vin";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      {/* Car & part detail */}
      <Route path="/car/:slug" component={CarDetail} />
      <Route path="/part/:partNumberClean" component={PartDetail} />
      {/* Search & tools */}
      <Route path="/search" component={Search} />
      <Route path="/part-finder" component={PartFinder} />
      {/* VIN decoder */}
      <Route path="/vin" component={VinDecoder} />
      <Route path="/vin/:vin">{(params) => <VinDecoder params={params} />}</Route>
      {/* Browse */}
      <Route path="/models" component={BmwModels} />
      <Route path="/models/:chassis" component={ModelHubPage} />
      <Route path="/series/:seriesSlug" component={SeriesLanding} />
      <Route path="/chassis/:chassisCode" component={ChassisLanding} />
      {/* Info pages */}
      <Route path="/servicing" component={Servicing} />
      <Route path="/about" component={About} />
      <Route path="/api-docs" component={ApiDocs} />
      <Route path="/friends" component={Friends} />
      <Route path="/recommended-sites" component={Friends} />
      {/* Auth */}
      <Route path="/login" component={Login} />
      <Route path="/reset-password" component={ResetPassword} />
      {/* User */}
      <Route path="/my-cars" component={MyCars} />
      {/* Admin */}
      <Route path="/admin" component={Admin} />
      <Route path="/admin/backup-restore" component={BackupRestore} />
      {/* 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function BmvVinRouter() {
  return (
    <Switch>
      <Route path="/" component={DecoderHome} />
      <Route path="/decoder" component={DecoderHome} />
      <Route path="/decoder/:brand" component={BrandDecoderHub} />
      <Route path="/guide" component={GuideIndex} />
      <Route path="/guide/:slug" component={GuideDetail} />
      <Route path="/glossary" component={GlossaryIndex} />
      <Route path="/glossary/:term" component={GlossaryTerm} />
      <Route path="/compare/:slug" component={BmvVinComparePage} />
      <Route path="/data/:slug" component={BmvVinDataPage} />
      <Route path="/bmw-:slug-vin-decoder" component={ModelVinPage} />
      <Route path="/bmw-:slug" component={ModelVinPage} />
      <Route path="/:kind/:value" component={FacetHub} />
      <Route path="/:segment" component={BmvVinSingleSegmentRoute} />
      <Route component={NotFound} />
    </Switch>
  );
}

import { BMV_VIN_FACET_KINDS } from "../../shared/bmv-vin/feature-registry";

function BmvVinSingleSegmentRoute() {
  const [location] = useLocation();
  const segment = decodeURIComponent(location.replace(/^\//, "").replace(/\/+$/, ""));

  if (/^[A-HJ-NPR-Z0-9]{17}$/i.test(segment)) return <VinDecoder />;
  if ((BMV_VIN_FACET_KINDS as readonly string[]).includes(segment)) return <FacetHub />;
  if (segment.startsWith("bmw-")) return <ModelVinPage />;
  return <NotFound />;
}

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; componentStack: string }
> {
  state: { error: Error | null; componentStack: string } = { error: null, componentStack: "" };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("BMV app render error", error, info.componentStack);
    this.setState({ componentStack: info.componentStack || "" });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background p-6 text-foreground">
          <h1 className="text-xl font-semibold">BMV app failed to render</h1>
          <p className="mt-2 text-sm text-muted-foreground">{this.state.error.message || String(this.state.error)}</p>
          <pre className="mt-4 whitespace-pre-wrap text-xs text-muted-foreground">{this.state.componentStack}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

/** Compact sign-in / user button for the topbar. */
function AppTopbarUser() {
  const { user, isAuthenticated, logout } = useAuth();
  const localize = useLocalizedHref();
  const [, navigate] = useLocation();

  if (!isAuthenticated) {
    return (
      <Link
        href={localize("/login")}
        className="bmv-eyebrow-accent text-[11px] px-2.5 py-1 border border-border-default hover:border-border-ink transition-colors"
      >
        Sign in
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => logout().then(() => navigate("/", { replace: true }))}
      title={`Signed in as ${user?.username ?? "user"} — click to sign out`}
      className="bmv-eyebrow text-[11px] px-2.5 py-1 border border-border-default hover:border-border-ink transition-colors"
    >
      {user?.username ?? "Account"}
    </button>
  );
}

export default function App() {
  const vinHost = isBmvVinHost();
  const style = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <HelmetProvider>
          <AuthProvider>
            <TooltipProvider>
              {vinHost ? (
                <div className="min-h-screen bg-background text-foreground">
                  <BmvVinRouter />
                </div>
              ) : (
                <SidebarProvider style={style as React.CSSProperties}>
                  <div className="flex h-screen w-full overflow-hidden bg-background">
                    <AppSidebar />
                    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                      <header className="flex items-center gap-2 px-3 h-12 border-b border-border-default bg-surface shrink-0 z-10">
                        <SidebarTrigger data-testid="button-sidebar-toggle" className="-ml-0.5 text-ink-tertiary hover:text-ink-primary" />
                        <div className="h-4 w-px bg-border-default" />
                        <div className="flex-1 min-w-0">
                          <UniversalSearch variant="topbar" className="max-w-[540px]" />
                        </div>
                        <CatalogStatusChip className="hidden sm:flex shrink-0" />
                        <div className="h-4 w-px bg-border-default hidden sm:block" />
                        <ThemeToggle />
                        <AppTopbarUser />
                      </header>
                      <main className="flex-1 overflow-auto">
                        <Router />
                      </main>
                    </div>
                  </div>
                </SidebarProvider>
              )}
              <Toaster />
            </TooltipProvider>
          </AuthProvider>
        </HelmetProvider>
      </AppErrorBoundary>
    </QueryClientProvider>
  );
}
