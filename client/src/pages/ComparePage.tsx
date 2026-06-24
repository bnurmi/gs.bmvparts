import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { GitCompare, Clock, ArrowRight, ChevronRight, Search } from "lucide-react";
import { Link } from "wouter";
import { renderMarkdown } from "@/lib/safeMarkdown";

interface ContentPage {
  id: number;
  slug: string;
  pageType: string;
  primaryKeyword: string;
  title: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  wordCount: number;
  generatedAt: string;
  lastRefreshedAt: string | null;
}

function estimateReadTime(wordCount: number): string {
  const mins = Math.max(1, Math.ceil(wordCount / 200));
  return `${mins} min read`;
}

function extractFaqs(content: string): { q: string; a: string }[] {
  const faqs: { q: string; a: string }[] = [];
  const lines = content.split('\n');
  let currentQ = "";
  for (const line of lines) {
    const qMatch = line.match(/^Q:\s*(.+)$/);
    const aMatch = line.match(/^A:\s*(.+)$/);
    if (qMatch) currentQ = qMatch[1];
    else if (aMatch && currentQ) { faqs.push({ q: currentQ, a: aMatch[1] }); currentQ = ""; }
  }
  return faqs;
}

function buildSchemas(page: ContentPage, faqs: { q: string; a: string }[]) {
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": page.title,
    "description": page.metaDescription,
    "url": `https://bmv.parts/compare/${page.slug}`,
    "datePublished": page.generatedAt,
    "dateModified": page.lastRefreshedAt || page.generatedAt,
    "publisher": { "@type": "Organization", "name": "BMV.parts", "url": "https://bmv.parts" },
    "author": { "@type": "Organization", "name": "BMV.parts Editorial Team" },
  };
  const faqSchema = faqs.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(f => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": { "@type": "Answer", "text": f.a },
    })),
  } : null;
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://bmv.parts/" },
      { "@type": "ListItem", "position": 2, "name": "Comparisons", "item": "https://bmv.parts/compare" },
      { "@type": "ListItem", "position": 3, "name": page.title, "item": `https://bmv.parts/compare/${page.slug}` },
    ],
  };
  return { article, faqSchema, breadcrumb };
}

export default function ComparePage() {
  const { slug } = useParams<{ slug: string }>();

  const { data: page, isLoading, error } = useQuery<ContentPage>({
    queryKey: ["/api/content/compare", slug],
    queryFn: async () => {
      const res = await fetch(`/api/content/compare/${slug}`);
      if (!res.ok) throw new Error("Comparison not found");
      return res.json();
    },
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Comparison not found</h1>
        <p className="text-muted-foreground mb-4">This comparison doesn't exist or hasn't been generated yet.</p>
        <Link href="/search">
          <Button variant="outline" data-testid="button-goto-search">
            <Search className="w-4 h-4 mr-2" /> Search Parts
          </Button>
        </Link>
      </div>
    );
  }

  const faqs = extractFaqs(page.content);
  const { article, faqSchema, breadcrumb } = buildSchemas(page, faqs);
  // safeHtml: content is HTML-escaped before markdown transforms — no XSS risk
  const safeHtml = renderMarkdown(page.content);

  return (
    <>
      <Helmet>
        <title>{page.metaTitle}</title>
        <meta name="description" content={page.metaDescription} />
        <link rel="canonical" href={`https://bmv.parts/compare/${page.slug}`} />
        <meta property="og:title" content={page.metaTitle} />
        <meta property="og:description" content={page.metaDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={`https://bmv.parts/compare/${page.slug}`} />
        <script type="application/ld+json">{JSON.stringify(article)}</script>
        {faqSchema && <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>}
        <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
      </Helmet>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6" aria-label="Breadcrumb" data-testid="breadcrumb-compare">
          <Link href="/" className="hover:text-foreground">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/compare" className="hover:text-foreground">Comparisons</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground truncate">{page.title}</span>
        </nav>

        <div className="mb-6">
          <Badge variant="secondary" className="mb-3" data-testid="badge-page-type">
            <GitCompare className="w-3 h-3 mr-1" /> Parts Comparison
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-3" data-testid="heading-compare-title">
            {page.title}
          </h1>
          <div className="flex items-center gap-3 text-xs text-muted-foreground" data-testid="compare-meta">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {estimateReadTime(page.wordCount)}
            </span>
            <span>·</span>
            <span>{page.wordCount.toLocaleString()} words</span>
            <span>·</span>
            <span>
              {page.lastRefreshedAt
                ? `Updated ${new Date(page.lastRefreshedAt).toLocaleDateString("en-AU", { year: "numeric", month: "short" })}`
                : `Published ${new Date(page.generatedAt).toLocaleDateString("en-AU", { year: "numeric", month: "short" })}`
              }
            </span>
          </div>
        </div>

        <Separator className="mb-8" />

        {/* Safe HTML: renderMarkdown() escapes all entities before transforms — XSS-safe */}
        <article
          className="prose prose-sm max-w-none dark:prose-invert"
          data-testid="article-content"
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />

        <Separator className="my-8" />

        <Card className="bg-muted/40 border-0" data-testid="card-cta">
          <CardContent className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-foreground">Compare Parts on BMV.parts</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Search OEM part numbers across every BMW chassis — fitment data, pricing, and cross-references included.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link href="/search">
                <Button size="sm" data-testid="button-cta-search">
                  <Search className="w-4 h-4 mr-1.5" /> Search Parts
                </Button>
              </Link>
              <Link href="/vin">
                <Button size="sm" variant="outline" data-testid="button-cta-vin">
                  Decode VIN <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
