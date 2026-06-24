import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { BookOpen, Clock, ArrowRight, ChevronRight, Search } from "lucide-react";
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

function buildFaqSchema(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(f => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": { "@type": "Answer", "text": f.a },
    })),
  };
}

function buildArticleSchema(page: ContentPage) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": page.title,
    "description": page.metaDescription,
    "url": `https://bmv.parts/guides/${page.slug}`,
    "datePublished": page.generatedAt,
    "dateModified": page.lastRefreshedAt || page.generatedAt,
    "publisher": { "@type": "Organization", "name": "BMV.parts", "url": "https://bmv.parts" },
    "author": { "@type": "Organization", "name": "BMV.parts Editorial Team" },
    "wordCount": page.wordCount,
  };
}

function buildBreadcrumbSchema(page: ContentPage) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://bmv.parts/" },
      { "@type": "ListItem", "position": 2, "name": "Buyer Guides", "item": "https://bmv.parts/guides" },
      { "@type": "ListItem", "position": 3, "name": page.title, "item": `https://bmv.parts/guides/${page.slug}` },
    ],
  };
}

export default function GuidePage() {
  const { slug } = useParams<{ slug: string }>();

  const { data: page, isLoading, error } = useQuery<ContentPage>({
    queryKey: ["/api/content/guides", slug],
    queryFn: async () => {
      const res = await fetch(`/api/content/guides/${slug}`);
      if (!res.ok) throw new Error("Guide not found");
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
        <h1 className="text-2xl font-bold mb-2">Guide not found</h1>
        <p className="text-muted-foreground mb-4">This guide doesn't exist or hasn't been generated yet.</p>
        <Link href="/search">
          <Button variant="outline" data-testid="button-goto-search">
            <Search className="w-4 h-4 mr-2" /> Search Parts
          </Button>
        </Link>
      </div>
    );
  }

  const faqs = extractFaqs(page.content);
  const faqSchema = faqs.length > 0 ? buildFaqSchema(faqs) : null;
  const articleSchema = buildArticleSchema(page);
  const breadcrumbSchema = buildBreadcrumbSchema(page);
  // safeHtml: content is HTML-escaped before markdown transforms — no XSS risk
  const safeHtml = renderMarkdown(page.content);

  return (
    <>
      <Helmet>
        <title>{page.metaTitle}</title>
        <meta name="description" content={page.metaDescription} />
        <link rel="canonical" href={`https://bmv.parts/guides/${page.slug}`} />
        <meta property="og:title" content={page.metaTitle} />
        <meta property="og:description" content={page.metaDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={`https://bmv.parts/guides/${page.slug}`} />
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
        {faqSchema && <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>}
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      </Helmet>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6" aria-label="Breadcrumb" data-testid="breadcrumb-guide">
          <Link href="/" className="hover:text-foreground">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/guides" className="hover:text-foreground">Buyer Guides</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground truncate">{page.title}</span>
        </nav>

        <div className="mb-6">
          <Badge variant="secondary" className="mb-3" data-testid="badge-page-type">
            <BookOpen className="w-3 h-3 mr-1" /> Buyer Guide
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-3" data-testid="heading-guide-title">
            {page.title}
          </h1>
          <div className="flex items-center gap-3 text-xs text-muted-foreground" data-testid="guide-meta">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {estimateReadTime(page.wordCount)}
            </span>
            <span>·</span>
            <span>{page.wordCount.toLocaleString()} words</span>
            <span>·</span>
            <span>
              {page.lastRefreshedAt
                ? `Updated ${new Date(page.lastRefreshedAt).toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric" })}`
                : `Published ${new Date(page.generatedAt).toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric" })}`
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
              <h3 className="font-semibold text-foreground">Find BMW Parts on BMV.parts</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Search our catalog of 5M+ OEM BMW parts with fitment data, pricing, and cross-references.
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
