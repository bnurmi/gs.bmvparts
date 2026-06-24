import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp, RefreshCw, Brain, BookOpen, GitCompare, BarChart3,
  Target, Play, Clock, CheckCircle, AlertCircle, Loader2, Zap,
  Search, FileText, Database,
} from "lucide-react";

interface GrowthStats {
  totalKeywords: number;
  targetedKeywords: number;
  totalContentPages: number;
  guidesCount: number;
  compareCount: number;
  dataCount: number;
  pendingRefresh: number;
  generatedToday: number;
  generatedThisWeek: number;
  highPriorityKeywords: {
    id: number; keyword: string; intent: string; priority: number;
    volume_est: number; difficulty: number;
  }[];
  recentPages: {
    id: number; slug: string; page_type: string; primary_keyword: string;
    word_count: number; generated_at: string; last_refreshed_at: string | null;
  }[];
  refreshQueue: {
    id: number; due_at: string; status: string; slug: string;
    primary_keyword: string; page_type: string;
  }[];
}

const intentColors: Record<string, string> = {
  commercial: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  transactional: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  comparison: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  informational: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  how_to: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  repair_guide: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  part_number: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const pageTypeIcon: Record<string, React.ReactNode> = {
  guide: <BookOpen className="w-3 h-3" />,
  compare: <GitCompare className="w-3 h-3" />,
  data: <BarChart3 className="w-3 h-3" />,
  chassis_part: <Database className="w-3 h-3" />,
};

function StatCard({ label, value, sub, icon }: { label: string; value: number | string; sub?: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="text-muted-foreground mt-1">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SeoGrowthPanel() {
  const { toast } = useToast();
  const [genLimit, setGenLimit] = useState("3");
  const [manualKeyword, setManualKeyword] = useState("");
  const [manualType, setManualType] = useState<"guide" | "compare" | "data">("guide");

  const { data: stats, isLoading, refetch } = useQuery<GrowthStats>({
    queryKey: ["/api/admin/seo/growth/stats"],
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/seo/growth/seed-keywords"),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/growth/stats"] });
      toast({ title: "Keywords seeded", description: `${data.seeded} new keywords added from catalog.` });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const generateMutation = useMutation({
    mutationFn: (limit: number) => apiRequest("POST", "/api/admin/seo/growth/generate", { limit }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/growth/stats"] });
      toast({ title: "Content generated", description: `${data.generated} pages generated, ${data.errors} errors.` });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/seo/growth/refresh"),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/growth/stats"] });
      toast({ title: "Refresh complete", description: `${data.refreshed} pages refreshed.` });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const manualGenMutation = useMutation({
    mutationFn: ({ keyword, pageType }: { keyword: string; pageType: string }) =>
      apiRequest("POST", "/api/admin/seo/growth/generate-one", { keyword, pageType }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/growth/stats"] });
      setManualKeyword("");
      toast({ title: "Page generated", description: `Created: /guides/${data.slug}` });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const isBusy = generateMutation.isPending || refreshMutation.isPending || seedMutation.isPending || manualGenMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5" /> SEO Growth Engine
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered keyword discovery, content generation, and 90-day refresh engine targeting 50,000+ indexed pages.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} data-testid="button-refresh-stats">
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Stats grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Keywords" value={stats.totalKeywords.toLocaleString()} sub={`${stats.targetedKeywords} targeted`} icon={<Search className="w-5 h-5" />} />
          <StatCard label="Content Pages" value={stats.totalContentPages.toLocaleString()} sub={`${stats.generatedToday} today`} icon={<FileText className="w-5 h-5" />} />
          <StatCard label="Buyer Guides" value={stats.guidesCount} icon={<BookOpen className="w-5 h-5" />} />
          <StatCard label="Comparisons" value={stats.compareCount} icon={<GitCompare className="w-5 h-5" />} />
          <StatCard label="Data Pages" value={stats.dataCount} icon={<BarChart3 className="w-5 h-5" />} />
          <StatCard label="Pending Refresh" value={stats.pendingRefresh} sub="due for 90-day update" icon={<Clock className="w-5 h-5" />} />
          <StatCard label="Generated Today" value={stats.generatedToday} icon={<Zap className="w-5 h-5" />} />
          <StatCard label="This Week" value={stats.generatedThisWeek} icon={<TrendingUp className="w-5 h-5" />} />
        </div>
      ) : null}

      <Separator />

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Keyword Seeding */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="w-4 h-4" /> Keyword Discovery
            </CardTitle>
            <CardDescription className="text-xs">
              Seed keywords from the catalog — all BMW chassis × part × model combinations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              size="sm" className="w-full"
              onClick={() => seedMutation.mutate()}
              disabled={isBusy}
              data-testid="button-seed-keywords"
            >
              {seedMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Database className="w-4 h-4 mr-2" />}
              Seed from Catalog
            </Button>
          </CardContent>
        </Card>

        {/* Batch Content Generation */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="w-4 h-4" /> Batch Generation
            </CardTitle>
            <CardDescription className="text-xs">
              Generate pages for the highest-priority untargeted keywords using GPT-4o.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Pages to generate</Label>
              <Select value={genLimit} onValueChange={setGenLimit}>
                <SelectTrigger className="h-7 text-xs mt-1" data-testid="select-gen-limit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 page</SelectItem>
                  <SelectItem value="3">3 pages</SelectItem>
                  <SelectItem value="5">5 pages</SelectItem>
                  <SelectItem value="10">10 pages</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm" className="w-full"
              onClick={() => generateMutation.mutate(Number(genLimit))}
              disabled={isBusy}
              data-testid="button-generate-pages"
            >
              {generateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              Generate {genLimit} Pages
            </Button>
          </CardContent>
        </Card>

        {/* Refresh Queue */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> 90-Day Refresh
            </CardTitle>
            <CardDescription className="text-xs">
              Re-generate stale content, update statistics, expand FAQs, and add new internal links.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              size="sm" className="w-full" variant="outline"
              onClick={() => refreshMutation.mutate()}
              disabled={isBusy}
              data-testid="button-run-refresh"
            >
              {refreshMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Process Refresh Queue
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Manual page generation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4" /> Generate Specific Page
          </CardTitle>
          <CardDescription className="text-xs">
            Enter any keyword to generate a targeted content page immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              placeholder='e.g. "BMW G80 M3 buying guide" or "most expensive BMW parts"'
              value={manualKeyword}
              onChange={e => setManualKeyword(e.target.value)}
              className="h-8 text-sm"
              data-testid="input-manual-keyword"
            />
          </div>
          <Select value={manualType} onValueChange={(v: any) => setManualType(v)}>
            <SelectTrigger className="h-8 text-xs w-36" data-testid="select-manual-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="guide">Buyer Guide</SelectItem>
              <SelectItem value="compare">Comparison</SelectItem>
              <SelectItem value="data">Data / Stats</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm" className="h-8"
            onClick={() => manualKeyword.trim() && manualGenMutation.mutate({ keyword: manualKeyword.trim(), pageType: manualType })}
            disabled={isBusy || !manualKeyword.trim()}
            data-testid="button-generate-manual"
          >
            {manualGenMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            <span className="ml-1.5">Generate</span>
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* High Priority Keywords */}
      {stats && stats.highPriorityKeywords.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Target className="w-4 h-4" /> High-Priority Untargeted Keywords
          </h3>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Keyword</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Intent</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Vol Est.</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Difficulty</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Priority</th>
                </tr>
              </thead>
              <tbody>
                {stats.highPriorityKeywords.map((kw, i) => (
                  <tr key={kw.id} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/20"}`} data-testid={`row-keyword-${kw.id}`}>
                    <td className="px-3 py-2 font-medium">{kw.keyword}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${intentColors[kw.intent] || ""}`}>
                        {kw.intent.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{kw.volume_est.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{kw.difficulty}/100</td>
                    <td className="px-3 py-2 text-right font-medium">{kw.priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recently Generated Pages */}
      {stats && stats.recentPages.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" /> Recently Generated Content
          </h3>
          <div className="space-y-2">
            {stats.recentPages.map(p => {
              const url = p.page_type === "guide" ? `/guides/${p.slug}`
                : p.page_type === "compare" ? `/compare/${p.slug}`
                : `/data/${p.slug}`;
              return (
                <div key={p.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-xs" data-testid={`row-page-${p.id}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-muted-foreground shrink-0">{pageTypeIcon[p.page_type]}</span>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium truncate hover:underline">
                      {p.primary_keyword}
                    </a>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-muted-foreground">
                    <span>{p.word_count.toLocaleString()}w</span>
                    <span>{new Date(p.generated_at).toLocaleDateString("en-AU", { month: "short", day: "numeric" })}</span>
                    {p.last_refreshed_at && (
                      <Badge variant="outline" className="text-xs h-4 px-1">refreshed</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Refresh Queue */}
      {stats && stats.refreshQueue.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" /> Refresh Queue ({stats.pendingRefresh} due)
          </h3>
          <div className="space-y-2">
            {stats.refreshQueue.map(q => (
              <div key={q.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-xs" data-testid={`row-refresh-${q.id}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-muted-foreground shrink-0">{pageTypeIcon[q.page_type]}</span>
                  <span className="font-medium truncate">{q.primary_keyword}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-muted-foreground">
                  <span>Due {new Date(q.due_at).toLocaleDateString("en-AU", { month: "short", day: "numeric", year: "numeric" })}</span>
                  <Badge variant={new Date(q.due_at) < new Date() ? "destructive" : "outline"} className="text-xs h-4 px-1">
                    {new Date(q.due_at) < new Date() ? "overdue" : "upcoming"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {stats && stats.totalContentPages === 0 && (
        <div className="text-center py-8 text-muted-foreground" data-testid="empty-state-growth">
          <Brain className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-medium">No content pages generated yet</p>
          <p className="text-xs mt-1">Start by seeding keywords from the catalog, then generate your first pages.</p>
        </div>
      )}
    </div>
  );
}
