// Admin panel for managing the AI FAQ cache (Task #228).
// Lists cached AI FAQ entries by page type, shows Q&A items,
// and provides a "Regenerate" button per entry.

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AiFaqRow {
  id: number;
  pageType: string;
  pageKey: string;
  locale: string;
  faqItems: { q: string; a: string }[];
  generatedAt: string;
}

const PAGE_TYPES = ["chassis", "series", "part", "vin", "facet"];
const LOCALES = ["en", "de-DE", "fr-FR", "es-ES", "it-IT", "zh-CN", "ko-KR", "es-MX", "en-ZA", "pt-BR", "ru-RU"];

export default function AiFaqAdminPanel() {
  const { toast } = useToast();
  const [pageType, setPageType] = useState("chassis");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery<{ rows: AiFaqRow[] }>({
    queryKey: ["/api/admin/faq/list", pageType],
    queryFn: async () => {
      const res = await fetch(`/api/admin/faq/list?pageType=${pageType}&limit=200`);
      if (!res.ok) throw new Error("fetch failed");
      return res.json();
    },
  });

  const regenMutation = useMutation({
    mutationFn: async ({ pageType, pageKey, locale }: { pageType: string; pageKey: string; locale?: string }) => {
      const res = await apiRequest("POST", "/api/admin/faq/regenerate", { pageType, pageKey, locale });
      return res.json();
    },
    onSuccess: (result) => {
      const ok = result.regenerated?.filter((r: any) => r.ok).length ?? 0;
      const fail = result.regenerated?.filter((r: any) => !r.ok).length ?? 0;
      toast({
        title: "Regeneration complete",
        description: `${ok} locale(s) regenerated${fail > 0 ? `, ${fail} failed` : ""}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/faq/list", pageType] });
    },
    onError: (err: any) => {
      toast({ title: "Regeneration failed", description: err?.message, variant: "destructive" });
    },
  });

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={pageType} onValueChange={setPageType}>
          <SelectTrigger className="w-40" data-testid="select-faq-page-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-faq-refresh">
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
        <span className="text-sm text-muted-foreground">
          {rows.length} cached entr{rows.length === 1 ? "y" : "ies"}
        </span>
      </div>

      {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}

      <div className="space-y-2">
        {rows.map(row => (
          <Card key={row.id} className="overflow-hidden" data-testid={`faq-admin-row-${row.id}`}>
            <CardHeader
              className="py-2 px-4 cursor-pointer flex flex-row items-center justify-between gap-2"
              onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {expandedId === row.id ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                <span className="font-mono text-sm font-medium truncate" data-testid={`faq-admin-key-${row.id}`}>{row.pageKey}</span>
                <Badge variant="outline" className="text-xs">{row.locale}</Badge>
                <Badge variant="secondary" className="text-xs">{row.faqItems.length} Q&amp;As</Badge>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground hidden sm:block">
                  {new Date(row.generatedAt).toLocaleDateString()}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  data-testid={`button-faq-regen-${row.id}`}
                  disabled={regenMutation.isPending}
                  onClick={e => {
                    e.stopPropagation();
                    regenMutation.mutate({ pageType: row.pageType, pageKey: row.pageKey, locale: row.locale });
                  }}
                >
                  {regenMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  data-testid={`button-faq-regen-all-${row.id}`}
                  disabled={regenMutation.isPending}
                  onClick={e => {
                    e.stopPropagation();
                    regenMutation.mutate({ pageType: row.pageType, pageKey: row.pageKey });
                  }}
                  title="Regenerate all 11 locales"
                >
                  All locales
                </Button>
              </div>
            </CardHeader>
            {expandedId === row.id && (
              <CardContent className="px-4 pb-3 pt-0 border-t">
                <div className="space-y-2 mt-2">
                  {row.faqItems.map((f, i) => (
                    <details key={i} className="border rounded-md p-2 group" data-testid={`faq-admin-item-${row.id}-${i}`}>
                      <summary className="text-sm font-medium cursor-pointer list-none flex items-start justify-between gap-2">
                        <span>{f.q}</span>
                        <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0 transition-transform group-open:rotate-90" />
                      </summary>
                      <p className="text-sm text-muted-foreground mt-1">{f.a}</p>
                    </details>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        ))}
        {!isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No cached AI FAQ entries for <strong>{pageType}</strong> yet. They are generated on first SSR hit or via the regenerate endpoint.</p>
        )}
      </div>
    </div>
  );
}
