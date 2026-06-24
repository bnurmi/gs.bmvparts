import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "wouter";
import { useLocalizedHref } from "@/lib/locale";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, Upload, X, Search, Package2, ChevronRight, Tag, AlertCircle, Car, Sparkles, Lock, Plus, ImageIcon, ExternalLink, ShoppingCart, Percent, CheckCircle, Loader2, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { trackedHref } from "@/lib/tracked-link";

interface MPerformanceData {
  inStock: boolean;
  productUrl: string | null;
  productTitle: string | null;
  price: number | null;
  searchUrl: string;
}

interface IdentifiedPart {
  name: string;
  partNumbers: string[];
  searchTerms: string[];
  confidence: "high" | "medium" | "low";
}

interface SearchResult {
  id: number;
  partNumber: string | null;
  partNumberClean: string | null;
  description: string;
  additionalInfo: string | null;
  quantity: string | null;
  weight: number | null;
  subcategoryName: string;
  categoryName: string;
  carName: string;
  carId: number;
  subcategoryId: number;
  matchedBy: string;
  aiPartName: string;
  confidence: string;
}

interface IdentifyResponse {
  identified: IdentifiedPart[];
  vehicleGuess: string | null;
  results: SearchResult[];
  searchedTerms: string[];
  totalFound: number;
  needsMoreContext: boolean;
}

interface UploadedImage {
  id: string;
  preview: string;
  dataUrl: string;
}

const MPERFORMANCE_STORE_URL = "https://www.mperformance.parts";
const COUPON_CODE = "PARTFINDER10";

function buildShopSearchUrl(partNumber: string): string {
  const cleaned = partNumber.replace(/[\s\-]/g, "");
  return `${MPERFORMANCE_STORE_URL}/search?q=${encodeURIComponent(cleaned)}&type=product`;
}

function collectPartNumbers(response: IdentifyResponse): string[] {
  const numbers = new Set<string>();
  for (const part of response.identified) {
    for (const pn of part.partNumbers) {
      if (pn) {
        const cleaned = pn.replace(/[\s\-]/g, "");
        if (cleaned) numbers.add(cleaned);
      }
    }
  }
  for (const result of response.results) {
    if (result.partNumberClean) numbers.add(result.partNumberClean);
  }
  return Array.from(numbers);
}

const confidenceColor = {
  high: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const MAX_IMAGES = 5;

export default function PartFinder() {
  const t = useT();
  const { isAuthenticated } = useAuth();
  const localize = useLocalizedHref();
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [response, setResponse] = useState<IdentifyResponse | null>(null);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [model, setModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stockData, setStockData] = useState<Record<string, MPerformanceData>>({});
  const [stockLoading, setStockLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!response) {
      setStockData({});
      return;
    }
    const partNumbers = collectPartNumbers(response);
    if (partNumbers.length === 0) return;

    setStockLoading(true);
    Promise.all(
      partNumbers.map(async (pn) => {
        try {
          const res = await fetch(`/api/parts/mperformance/${encodeURIComponent(pn)}`);
          if (!res.ok) return [pn, null] as const;
          const data: MPerformanceData = await res.json();
          return [pn, data] as const;
        } catch {
          return [pn, null] as const;
        }
      })
    ).then((results) => {
      const map: Record<string, MPerformanceData> = {};
      for (const [pn, data] of results) {
        if (data) map[pn] = data;
      }
      setStockData(map);
      setStockLoading(false);
    });
  }, [response]);

  const inStockParts = Object.entries(stockData).filter(([_, d]) => d.inStock);

  // External catalog fallback: when the local DB has zero hits but the AI
  // identified a search term, ask the OEM catalog directly.
  const externalQueryTerm = (response?.searchedTerms?.[0] || "").trim();
  const externalQueryModel = (response?.vehicleGuess || model || "").trim().toUpperCase();
  const shouldQueryExternal =
    !!response &&
    response.results.length === 0 &&
    externalQueryTerm.length > 1;
  const externalQs = new URLSearchParams();
  if (externalQueryTerm) externalQs.set("description", externalQueryTerm);
  if (externalQueryModel) externalQs.set("model", externalQueryModel);
  externalQs.set("limit", "12");
  const { data: externalSearch, isLoading: externalSearchLoading } = useQuery<{
    found: boolean;
    total?: number;
    parts: Array<{
      id: number;
      partNumber: string;
      description: string;
      model: string;
      modelSeries?: string;
      partGroup?: string;
    }>;
  }>({
    queryKey: ["/api/parts/external-search", externalQueryTerm, externalQueryModel],
    queryFn: async () => {
      const r = await fetch(`/api/parts/external-search?${externalQs.toString()}`);
      if (!r.ok) return { found: false, parts: [] };
      return r.json();
    },
    enabled: shouldQueryExternal,
    staleTime: 60_000,
  });

  const addFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      toast({ title: t.partFinder.limitReachedTitle, description: t.partFinder.limitReachedBody(MAX_IMAGES), variant: "destructive" });
      return;
    }

    const toProcess = fileArray.slice(0, remaining);
    let skipped = 0;

    for (const file of toProcess) {
      if (!file.type.startsWith("image/")) {
        skipped++;
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        skipped++;
        continue;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const newImage: UploadedImage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          preview: dataUrl,
          dataUrl,
        };
        setImages(prev => {
          if (prev.length >= MAX_IMAGES) return prev;
          return [...prev, newImage];
        });
      };
      reader.readAsDataURL(file);
    }

    if (skipped > 0) {
      toast({ title: t.partFinder.skippedTitle, description: t.partFinder.skippedBody, variant: "destructive" });
    }
    if (fileArray.length > remaining) {
      toast({ title: t.partFinder.limitReachedTitle, description: t.partFinder.onlyAddedBody(remaining, MAX_IMAGES) });
    }
  }, [images.length, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
    setResponse(null);
    setShowVehicleForm(false);
    setError(null);
  };

  const clearAll = () => {
    setImages([]);
    setResponse(null);
    setShowVehicleForm(false);
    setError(null);
    setModel("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const identifyPart = async (vehicleModel?: string) => {
    if (images.length === 0) return;
    setIsAnalyzing(true);
    setError(null);

    try {
      const body: any = {
        images: images.map(img => img.dataUrl),
      };
      if (vehicleModel) {
        body.make = "BMW";
        body.model = vehicleModel;
      }

      const res = await apiRequest("POST", "/api/parts/identify", body);
      const data: IdentifyResponse = await res.json();
      setResponse(data);

      if (data.needsMoreContext && !vehicleModel) {
        setShowVehicleForm(true);
      }
    } catch (err: any) {
      setError(err.message || "Failed to analyze image");
      toast({ title: t.partFinder.analysisFailed, description: err.message, variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRetryWithModel = () => {
    if (model.trim()) {
      identifyPart(model.trim());
      setShowVehicleForm(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">{t.partFinder.heading}</h1>
          <p className="text-muted-foreground mt-1">{t.partFinder.intro}</p>
        </div>
        <Card>
          <CardContent className="p-8 text-center">
            <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">{t.partFinder.signInRequiredTitle}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {t.partFinder.signInRequiredBody}
            </p>
            <Link href="/login">
              <Button data-testid="button-login-prompt">{t.partFinder.signInToUse}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <SEO
        title="AI BMW Part Identifier — Upload Photo, Find Part Number"
        description="Upload a photo of any BMW part and our AI will identify it, find the OEM part number, and show pricing and availability across suppliers."
        path="/part-finder"
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Part Finder", url: "/part-finder" },
        ]}
      />
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">{t.partFinder.heading}</h1>
        <p className="text-muted-foreground mt-1">{t.partFinder.intro}</p>
      </div>

      <Card>
        <CardContent className="p-6">
          {images.length === 0 ? (
            <div
              className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              data-testid="dropzone-upload"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Camera className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-lg">{t.partFinder.uploadHeading}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t.partFinder.uploadDropHint}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.partFinder.uploadLimits(MAX_IMAGES)}
                  </p>
                </div>
                <Button variant="outline" className="mt-2" data-testid="button-browse">
                  <Upload className="w-4 h-4 mr-2" />
                  {t.partFinder.chooseFiles}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{t.partFinder.imageCount(images.length, MAX_IMAGES)}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={clearAll} data-testid="button-clear-all">
                  <X className="w-4 h-4 mr-1" />
                  {t.common.clearAll}
                </Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {images.map((img) => (
                  <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden bg-muted" data-testid={`img-preview-${img.id}`}>
                    <img
                      src={img.preview}
                      alt="Uploaded part"
                      className="w-full h-full object-cover"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1.5 right-1.5 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeImage(img.id)}
                      data-testid={`button-remove-${img.id}`}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}

                {images.length < MAX_IMAGES && (
                  <div
                    className="aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    data-testid="button-add-more"
                  >
                    <Plus className="w-6 h-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{t.partFinder.addMore}</span>
                  </div>
                )}
              </div>

              {!response && !isAnalyzing && (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => identifyPart()}
                  data-testid="button-identify"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  {images.length > 1 ? t.partFinder.identifyMany : t.partFinder.identifyOne}
                </Button>
              )}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                addFiles(e.target.files);
              }
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            data-testid="input-file"
          />
        </CardContent>
      </Card>

      {isAnalyzing && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                <Search className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-medium" data-testid="text-analyzing">{images.length > 1 ? t.partFinder.analyzingMany(images.length) : t.partFinder.analyzingOne(images.length)}</p>
                <p className="text-sm text-muted-foreground">{images.length > 1 ? t.partFinder.analyzingSubMany : t.partFinder.analyzingSubOne}</p>
              </div>
            </div>
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-3/4" />
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="p-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-destructive">{t.partFinder.analysisFailed}</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => identifyPart()} data-testid="button-retry">
                {t.common.retry}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {response && (
        <>
          {response.identified.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  {t.partFinder.aiIdentification}
                  {response.vehicleGuess && (
                    <Badge variant="outline" className="ml-2 font-normal">
                      <Car className="w-3 h-3 mr-1" />
                      {response.vehicleGuess}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {response.identified.map((part, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50" data-testid={`card-ai-part-${idx}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{part.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${confidenceColor[part.confidence]}`}>
                          {part.confidence}
                        </span>
                      </div>
                      {part.partNumbers.length > 0 && (
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          {part.partNumbers.map((pn, i) => (
                            <Badge key={i} variant="secondary" className="text-xs font-mono">{pn}</Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        {part.searchTerms.map((term, i) => (
                          <span key={i} className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            {term}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {showVehicleForm && response.results.length === 0 && (
            <Card className="border-amber-200 dark:border-amber-800">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <Car className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium" data-testid="text-no-results">{t.partFinder.noExactMatches}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t.partFinder.noExactMatchesHint}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Input
                        placeholder={t.partFinder.modelPlaceholder}
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleRetryWithModel()}
                        className="max-w-xs"
                        data-testid="input-model"
                      />
                      <Button onClick={handleRetryWithModel} disabled={!model.trim()} data-testid="button-retry-model">
                        <Search className="w-4 h-4 mr-2" />
                        {t.partFinder.searchAgain}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {response.results.length === 0 && externalSearchLoading && (
            <Card>
              <CardContent className="p-5 flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t.partFinder.checkingExternal}</span>
              </CardContent>
            </Card>
          )}

          {response.results.length === 0 && externalSearch?.found && externalSearch.parts.length > 0 && (
            <Card data-testid="card-external-fallback">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  {t.partFinder.oemMatches}
                  <Badge variant="secondary" className="ml-1">{externalSearch.total ?? externalSearch.parts.length}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {t.partFinder.oemMatchesHint}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {externalSearch.parts.map((part) => {
                  const pnClean = part.partNumber.replace(/\s/g, "");
                  return (
                    <Link
                      key={part.id}
                      href={localize(`/part/${pnClean}`)}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border"
                      data-testid={`link-external-result-${part.id}`}
                    >
                      <Package2 className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{part.description}</span>
                          {part.model && (
                            <Badge variant="outline" className="text-xs shrink-0 font-mono">{part.model}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span className="font-mono">{part.partNumber}</span>
                          {part.partGroup && <span className="truncate">· {part.partGroup}</span>}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {stockLoading && collectPartNumbers(response).length > 0 && (
            <Card className="border-muted">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t.partFinder.checkingStock}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {!stockLoading && inStockParts.length > 0 && (
            <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30" data-testid="card-mperformance-promo">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                    <Percent className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-base" data-testid="text-shop-promo-title">
                        {inStockParts.length === 1 ? t.partFinder.partAvailable : t.partFinder.partsAvailable(inStockParts.length)}
                      </h3>
                      <Badge className="bg-green-600 hover:bg-green-700 text-white text-xs gap-1">
                        <CheckCircle className="w-3 h-3" />
                        {t.partFinder.inStock}
                      </Badge>
                      <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-xs">{t.partFinder.tenPercentOff}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t.partFinder.couponPitch}
                    </p>
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      <code className="px-3 py-1.5 bg-white dark:bg-gray-900 rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-700 font-mono font-bold text-blue-700 dark:text-blue-400 text-sm tracking-wider select-all" data-testid="text-coupon-code">
                        {COUPON_CODE}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs text-muted-foreground"
                        onClick={() => {
                          navigator.clipboard.writeText(COUPON_CODE);
                          toast({ title: t.partFinder.couponCopiedTitle, description: t.partFinder.couponCopiedBody(COUPON_CODE) });
                        }}
                        data-testid="button-copy-coupon"
                      >
                        {t.common.copyCode}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {inStockParts.slice(0, 6).map(([pn, data]) => (
                        <a
                          key={pn}
                          href={trackedHref(data.productUrl || data.searchUrl, { label: "MPerformance.parts", partNumber: pn, source: "part-finder" })}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`link-shop-pn-${pn}`}
                        >
                          <Button variant="outline" size="sm" className="text-xs gap-1.5 bg-white dark:bg-gray-900 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950">
                            <ShoppingCart className="w-3.5 h-3.5" />
                            {pn}
                            {data.price != null && <span className="text-muted-foreground">A${data.price.toFixed(2)}</span>}
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </a>
                      ))}
                      {inStockParts.length > 6 && (
                        <span className="text-xs text-muted-foreground self-center">{t.partFinder.plusMore(inStockParts.length - 6)}</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {response.results.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package2 className="w-5 h-5" />
                  {t.partFinder.catalogMatches}
                  <Badge variant="secondary" className="ml-1">{response.totalFound}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {response.results.map((result) => (
                  <div key={result.id} className="flex items-center gap-2 p-3 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border" data-testid={`card-result-${result.id}`}>
                    <Link
                      href={localize(`/part/${result.partNumberClean}`)}
                      className="flex items-center gap-3 flex-1 min-w-0"
                      data-testid={`link-result-${result.id}`}
                    >
                      <Package2 className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{result.description}</span>
                          {result.matchedBy === "partNumber" && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              <Tag className="w-3 h-3 mr-1" />
                              {t.partFinder.partNumberMatch}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {result.partNumberClean && (
                            <span className="font-mono">{result.partNumberClean}</span>
                          )}
                          <span>{result.carName}</span>
                          <span>{(result.categoryName === 'RealOEM Backfill' || result.categoryName === 'realoem-backfill') ? 'Additional Parts' : result.categoryName} › {result.subcategoryName}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </Link>
                    {result.partNumberClean && stockData[result.partNumberClean]?.inStock && (
                      <a
                        href={trackedHref(stockData[result.partNumberClean].productUrl || stockData[result.partNumberClean].searchUrl, { label: "MPerformance.parts", partNumber: result.partNumberClean, source: "part-finder" })}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`link-shop-${result.id}`}
                      >
                        <Button variant="outline" size="sm" className="shrink-0 text-xs gap-1.5 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950">
                          <CheckCircle className="w-3.5 h-3.5" />
                          {t.partFinder.buy}
                        </Button>
                      </a>
                    )}
                  </div>
                ))}

                {!showVehicleForm && response.results.length > 0 && (
                  <div className="pt-3 border-t">
                    <p className="text-sm text-muted-foreground mb-2">{t.partFinder.refinePrompt}</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder={t.partFinder.modelPlaceholder}
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleRetryWithModel()}
                        className="max-w-xs"
                        data-testid="input-model-refine"
                      />
                      <Button variant="outline" onClick={handleRetryWithModel} disabled={!model.trim()} data-testid="button-refine">
                        {t.common.refine}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
