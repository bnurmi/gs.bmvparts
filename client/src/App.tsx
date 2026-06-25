import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider } from "@/lib/auth";
import Home from "@/pages/Home";
import CarDetail from "@/pages/CarDetail";
import Search from "@/pages/Search";
import PartDetail from "@/pages/PartDetail";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/car/:id" component={CarDetail} />
      <Route path="/part/:partNumberClean" component={PartDetail} />
      <Route path="/search" component={Search} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  const style = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex h-screen w-full overflow-hidden bg-background">
              <AppSidebar />
              <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                <header className="flex items-center gap-3 px-4 h-12 border-b bg-background/95 backdrop-blur-sm shrink-0 z-10">
                  <SidebarTrigger data-testid="button-sidebar-toggle" className="-ml-1" />
                  <div className="h-5 w-px bg-border" />
                  <span className="text-sm font-medium text-muted-foreground">BMW M Parts Catalog</span>
                </header>
                <main className="flex-1 overflow-auto">
                  <Router />
                </main>
              </div>
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
