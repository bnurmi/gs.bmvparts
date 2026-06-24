import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle, XCircle, Eye, Globe, FileText, Clock,
  AlertCircle, RefreshCw, Archive, Loader2, Activity,
  Send, ShieldCheck,
} from "lucide-react";

interface PublisherPage {
  id: number;
  slug: string;
  content_type: string;
  status: string;
  approved: boolean;
  title: string;
  meta_description: string | null;
  category: string | null;
  tags: string[] | null;
  source: string;
  author: string | null;
  domain: string;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

interface AuditEntry {
  id: number;
  timestamp: string;
  actor: string;
  token_label: string | null;
  action: string;
  content_type: string | null;
  target_id: number | null;
  target_slug: string | null;
  target_url: string | null;
  summary: string | null;
  status: string;
  error: string | null;
}

const statusColors: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  published: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  archived: "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-400",
};

const actionColors: Record<string, string> = {
  create: "text-blue-600 dark:text-blue-400",
  update: "text-amber-600 dark:text-amber-400",
  publish: "text-green-600 dark:text-green-400",
  admin_publish: "text-green-600 dark:text-green-400",
  archive: "text-gray-600 dark:text-gray-400",
  approve: "text-indigo-600 dark:text-indigo-400",
  reject: "text-red-600 dark:text-red-400",
  delete: "text-red-600 dark:text-red-400",
  sitemap_refresh: "text-teal-600 dark:text-teal-400",
};

function DraftsTable() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const params = new URLSearchParams();
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (sourceFilter !== "all") params.set("source", sourceFilter);
  params.set("limit", "100");

  const { data, isLoading, refetch } = useQuery<{ pages: PublisherPage[]; total: number }>({
    queryKey: ["/api/admin/seo/publisher/pages", statusFilter, sourceFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/seo/publisher/pages?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: (idOrSlug: string) => apiRequest("POST", `/api/admin/seo/publisher/approve/${idOrSlug}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/publisher/pages"] });
      toast({ title: "Approved", description: "Page approved for publishing." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (idOrSlug: string) => apiRequest("POST", `/api/admin/seo/publisher/reject/${idOrSlug}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/publisher/pages"] });
      toast({ title: "Rejected", description: "Page returned to draft." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const publishMutation = useMutation({
    mutationFn: (idOrSlug: string) => apiRequest("POST", `/api/admin/seo/publisher/publish/${idOrSlug}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/publisher/pages"] });
      toast({ title: "Published", description: "Page is now live." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (idOrSlug: string) => apiRequest("DELETE", `/api/admin/seo/publisher/pages/${idOrSlug}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/publisher/pages"] });
      toast({ title: "Deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isBusy = approveMutation.isPending || rejectMutation.isPending || publishMutation.isPending || deleteMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Status:</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-7 text-xs w-28" data-testid="select-publisher-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Source:</span>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="h-7 text-xs w-36" data-testid="select-publisher-source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="roman-hermes">Roman/Hermes</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} data-testid="button-refresh-publisher">
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
        {data && (
          <span className="text-xs text-muted-foreground ml-auto">{data.total} total</span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : !data?.pages.length ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="publisher-empty-state">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-medium">No publisher pages yet</p>
          <p className="text-xs mt-1">Pages created by the Roman/Hermes automation agent will appear here for review.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Title / Slug</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Type</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden md:table-cell">Source</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden md:table-cell">Domain</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.pages.map((page, i) => (
                <tr key={page.id} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/20"}`} data-testid={`row-publisher-page-${page.id}`}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium truncate max-w-xs">{page.title}</div>
                    <div className="text-muted-foreground font-mono truncate max-w-xs">/{page.slug}</div>
                    {page.approved && (
                      <span className="inline-flex items-center gap-0.5 text-indigo-600 dark:text-indigo-400">
                        <ShieldCheck className="w-3 h-3" /> approved
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    <Badge variant="outline" className="text-xs">{page.content_type}</Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusColors[page.status] ?? ""}`}>
                      {page.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground">{page.source}</td>
                  <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground">{page.domain}</td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {page.status === "draft" && !page.approved && (
                        <Button
                          size="sm" variant="ghost" className="h-6 px-2 text-indigo-600"
                          onClick={() => approveMutation.mutate(String(page.id))}
                          disabled={isBusy}
                          data-testid={`button-approve-${page.id}`}
                          title="Approve"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {page.status === "draft" && page.approved && (
                        <Button
                          size="sm" variant="ghost" className="h-6 px-2 text-green-600"
                          onClick={() => publishMutation.mutate(String(page.id))}
                          disabled={isBusy}
                          data-testid={`button-publish-${page.id}`}
                          title="Publish"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {page.status === "draft" && (
                        <Button
                          size="sm" variant="ghost" className="h-6 px-2 text-green-600"
                          onClick={() => publishMutation.mutate(String(page.id))}
                          disabled={isBusy}
                          data-testid={`button-admin-publish-${page.id}`}
                          title="Admin publish (bypasses approval)"
                        >
                          <Globe className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {page.approved && page.status === "draft" && (
                        <Button
                          size="sm" variant="ghost" className="h-6 px-2 text-red-500"
                          onClick={() => rejectMutation.mutate(String(page.id))}
                          disabled={isBusy}
                          data-testid={`button-reject-${page.id}`}
                          title="Reject"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {page.status === "published" && (
                        <a
                          href={`https://${page.domain}/${page.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center h-6 px-2 text-muted-foreground hover:text-foreground"
                          data-testid={`link-view-${page.id}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <Button
                        size="sm" variant="ghost" className="h-6 px-2 text-red-400 hover:text-red-600"
                        onClick={() => { if (confirm(`Delete '${page.title}'?`)) deleteMutation.mutate(String(page.id)); }}
                        disabled={isBusy}
                        data-testid={`button-delete-${page.id}`}
                        title="Delete"
                      >
                        <XCircle className="w-3 h-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AuditLogTable() {
  const { data, isLoading, refetch } = useQuery<{ entries: AuditEntry[]; total: number }>({
    queryKey: ["/api/admin/seo/publisher/audit"],
    queryFn: async () => {
      const res = await fetch("/api/admin/seo/publisher/audit?limit=100", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{data?.total ?? 0} log entries</span>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} data-testid="button-refresh-audit">
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      ) : !data?.entries.length ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="audit-empty-state">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No audit events yet</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Time</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Actor</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Action</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Target</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden md:table-cell">Summary</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Result</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry, i) => (
                <tr key={entry.id} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/20"}`} data-testid={`row-audit-${entry.id}`}>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleDateString("en-AU", { month: "short", day: "numeric" })}{" "}
                    {new Date(entry.timestamp).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-3 py-2 font-medium">{entry.actor}</td>
                  <td className={`px-3 py-2 font-mono font-medium ${actionColors[entry.action] ?? ""}`}>
                    {entry.action}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell font-mono">
                    {entry.target_slug ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell max-w-xs truncate">
                    {entry.summary ?? entry.error ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {entry.status === "ok" ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    ) : entry.status === "rejected" ? (
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-500" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SeoPublisherPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-md bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 mt-0.5">
          <Globe className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-base font-semibold">Publisher Drafts</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pages and articles created by the Roman/Hermes automation agent via the SEO Publisher API.
            Review, approve, and publish content from here.
          </p>
        </div>
      </div>

      <Tabs defaultValue="drafts">
        <TabsList className="h-8">
          <TabsTrigger value="drafts" className="text-xs h-7" data-testid="tab-publisher-drafts">
            <FileText className="w-3.5 h-3.5 mr-1.5" /> Content
          </TabsTrigger>
          <TabsTrigger value="audit" className="text-xs h-7" data-testid="tab-publisher-audit">
            <Activity className="w-3.5 h-3.5 mr-1.5" /> Audit Log
          </TabsTrigger>
          <TabsTrigger value="info" className="text-xs h-7" data-testid="tab-publisher-info">
            <ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> API Info
          </TabsTrigger>
        </TabsList>

        <TabsContent value="drafts" className="mt-4">
          <DraftsTable />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditLogTable />
        </TabsContent>

        <TabsContent value="info" className="mt-4">
          <PublisherApiInfo />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PublisherApiInfo() {
  // Health check uses the admin session — the bearer token is never sent to
  // or handled in the browser. It lives exclusively in server environment vars.
  const { data: health, isLoading } = useQuery({
    queryKey: ["/api/admin/seo/publisher/health"],
    retry: false,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">API Endpoints</CardTitle>
          <CardDescription className="text-xs">Bearer-token authenticated REST API at /api/seo/publisher/</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-muted/50 p-3 space-y-1 font-mono text-xs">
            {[
              "GET  /api/seo/publisher/health",
              "GET  /api/seo/publisher/capabilities",
              "POST /api/seo/publisher/validate",
              "POST /api/seo/publisher/pages",
              "PUT  /api/seo/publisher/pages/:idOrSlug",
              "GET  /api/seo/publisher/pages",
              "GET  /api/seo/publisher/pages/:idOrSlug",
              "POST /api/seo/publisher/articles",
              "PUT  /api/seo/publisher/articles/:idOrSlug",
              "GET  /api/seo/publisher/articles",
              "GET  /api/seo/publisher/articles/:idOrSlug",
              "POST /api/seo/publisher/publish/:idOrSlug",
              "POST /api/seo/publisher/archive/:idOrSlug",
              "POST /api/seo/publisher/sitemap/refresh",
              "GET  /api/seo/publisher/audit",
            ].map((ep) => (
              <div key={ep} className="text-muted-foreground hover:text-foreground transition-colors">
                {ep}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Configuration Status</CardTitle>
          <CardDescription className="text-xs">Live config from server — bearer token never sent to browser</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {isLoading && <div className="text-muted-foreground">Loading…</div>}
          {health && (health as any).ok && (
            <>
              <div className="flex justify-between gap-4 border-b pb-1.5">
                <code className="font-mono text-muted-foreground">SEO_PUBLISHER_API_TOKEN</code>
                <Badge variant={(health as any).tokenConfigured ? "default" : "destructive"} className="text-xs">
                  {(health as any).tokenConfigured ? "SET" : "NOT SET"}
                </Badge>
              </div>
              <div className="flex justify-between gap-4 border-b pb-1.5">
                <code className="font-mono text-muted-foreground">Allowed Domains</code>
                <span className="text-right text-muted-foreground">{((health as any).domains ?? []).join(", ")}</span>
              </div>
              <div className="flex justify-between gap-4 border-b pb-1.5">
                <code className="font-mono text-muted-foreground">Default Mode</code>
                <span className="text-right text-muted-foreground">{(health as any).defaultMode}</span>
              </div>
              <div className="flex justify-between gap-4">
                <code className="font-mono text-muted-foreground">Require Approval</code>
                <span className="text-right text-muted-foreground">{(health as any).requireApproval}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Rate Limits (per token, per minute)</CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-1">
          <div className="flex justify-between"><span>Read operations (GET)</span><Badge variant="outline">60 / min</Badge></div>
          <div className="flex justify-between"><span>Write operations (POST/PUT)</span><Badge variant="outline">10 / min</Badge></div>
          <div className="flex justify-between"><span>Publish operations</span><Badge variant="outline">3 / min</Badge></div>
        </CardContent>
      </Card>
    </div>
  );
}
