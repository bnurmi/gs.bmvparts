// Reusable AI-generated FAQ section component (Task #228).
// Queries the /api/faq endpoint for cached GPT-4o FAQ pairs keyed by
// (pageType, pageKey, locale). Only renders once the cache has items.
// Falls back silently (no flash, no error state) when items are absent.

import { useQuery } from "@tanstack/react-query";
import { Sparkles, ChevronRight } from "lucide-react";

export type AiFaqPageType = "part" | "chassis" | "series" | "vin" | "facet";

interface AiFaqItem {
  q: string;
  a: string;
}

interface AiFaqResponse {
  faqItems: AiFaqItem[];
  cached: boolean;
  generatedAt?: string;
}

interface AiFaqSectionProps {
  pageType: AiFaqPageType;
  pageKey: string;
  locale: string;
  className?: string;
}

export function AiFaqSection({ pageType, pageKey, locale, className = "" }: AiFaqSectionProps) {
  const enabled = !!(pageType && pageKey && locale);

  const { data, isLoading } = useQuery<AiFaqResponse>({
    queryKey: ["/api/faq", pageType, pageKey, locale],
    queryFn: async () => {
      const params = new URLSearchParams({ pageType, pageKey, locale });
      const res = await fetch(`/api/faq?${params}`);
      if (!res.ok) throw new Error("faq unavailable");
      return res.json();
    },
    enabled,
    staleTime: 1000 * 60 * 60, // 1 hour — FAQ items rarely change
    retry: false,
  });

  // Nothing to show while loading or when cache is empty.
  if (!enabled) return null;
  if (isLoading) return null; // Silent — no skeleton flash for FAQ
  if (!data || data.faqItems.length === 0) return null;

  return (
    <section className={`mt-8 ${className}`} data-testid="section-ai-faq">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Frequently Asked Questions</h2>
      </div>
      <div className="space-y-2">
        {data.faqItems.map((f, i) => (
          <details
            key={i}
            className="border rounded-lg p-3 group"
            data-testid={`ai-faq-item-${i}`}
            open={i === 0}
          >
            <summary className="font-medium text-sm cursor-pointer list-none flex items-start justify-between gap-2">
              <span data-testid={`ai-faq-question-${i}`}>{f.q}</span>
              <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 transition-transform group-open:rotate-90" />
            </summary>
            <p
              className="text-sm text-muted-foreground mt-2 leading-relaxed"
              data-testid={`ai-faq-answer-${i}`}
            >
              {f.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
