import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, Camera, Loader2, Download, Plus, Trash2, ChevronDown, ChevronUp,
  Lock, Car, Zap, FileText, DollarSign, CheckCircle, Eye, Star,
  Shield, Package, RefreshCw, AlertTriangle,
} from "lucide-react";

const CHASSIS_LIST = [
  "G80 M3 Competition", "G82 M4 Competition", "G87 M2",
  "F80 M3", "F82 M4", "F87 M2",
  "E90 M3", "E92 M3", "E93 M3",
  "F10 M5", "F90 M5", "G30 5 Series",
  "F12 M6", "F06 M6 Gran Coupé",
  "G01 X3", "G05 X5", "G06 X6",
  "Other BMW",
];

const SAMPLE_ROWS = [
  { item: "Item 1", desc: "Front Bumper Cover M3 Competition", oemNo: "51-11-8-053-346", bmwNew: "2,450.00", ourPrice: "1,225.00", saving: "1,225.00", category: "Front Clip" },
  { item: "Item 2", desc: "Bonnet / Hood Assembly M3", oemNo: "41-00-8-053-100", bmwNew: "3,890.00", ourPrice: "1,945.00", saving: "1,945.00", category: "Body Panels" },
  { item: "Item 3", desc: "Left Front Headlight Assembly Adaptive", oemNo: "63-11-9-494-199", bmwNew: "4,120.00", ourPrice: "2,060.00", saving: "2,060.00", category: "Headlamps" },
  { item: "Item 4", desc: "Front Bumper Reinforcement Beam", oemNo: "51-11-7-498-032", bmwNew: "780.00", ourPrice: "390.00", saving: "390.00", category: "Structural" },
  { item: "Item 5", desc: "Radiator Assembly Dual Circuit", oemNo: "17-11-8-069-565", bmwNew: "1,560.00", ourPrice: "780.00", saving: "780.00", category: "Cooling" },
];

interface QuoteRow {
  id: string;
  estimateItem: string;
  oemDescription: string;
  oemNumber: string | null;
  bmwNew: number;
  ourPrice: number;
  saving: number;
  category: string;
  status: "required" | "optional" | "review";
  notes?: string;
}

interface PhotoQuote {
  id: number;
  quoteRef: string;
  vehicle: string;
  vin: string | null;
  quoteRows: QuoteRow[];
  totalBmwNew: number;
  totalOurPrice: number;
  totalSaving: number;
  createdAt: string;
}

function StatusBadge({ status }: { status: QuoteRow["status"] }) {
  if (status === "required") return <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200">Required</Badge>;
  if (status === "optional") return <Badge className="text-[10px] bg-yellow-100 text-yellow-700 border-yellow-200">Optional</Badge>;
  return <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-200">Review</Badge>;
}

function SalesPage() {
  const [, navigate] = useLocation();
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-16">
      <section className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-medium px-3 py-1.5 rounded-full border border-blue-200 dark:border-blue-800">
          <Zap className="w-3.5 h-3.5" /> Powered by GPT-4o Vision
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
          BMW damage quotes in <span className="text-blue-600 dark:text-blue-400">minutes, not hours</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Upload accident photos, let AI identify every damaged part, then instantly match against 5.97M+ OEM part numbers with live AUD pricing. Export a professional CSV quote ready for the customer.
        </p>
        <Button size="lg" className="mt-4 px-8" onClick={() => navigate("/auth")} data-testid="button-subscribe-hero">
          <Lock className="w-4 h-4 mr-2" />
          Subscribe to unlock
        </Button>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-center mb-8">Everything you need in one tool</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { icon: Camera, title: "Upload any photo", desc: "JPEG or PNG, up to 20 photos per quote. Any angle, any lighting." },
            { icon: Eye, title: "AI identifies every damaged part", desc: "GPT-4o vision analyses each zone: front, rear, side, interior, airbags and more." },
            { icon: Package, title: "Matched to 5.97M+ OEM part numbers", desc: "Every detected part is cross-referenced against our BMW parts database automatically." },
            { icon: DollarSign, title: "Instant AUD pricing at 50% off BMW new", desc: "BMW New price and your discounted selling price calculated in real time." },
            { icon: CheckCircle, title: "Editable line-item review", desc: "Tweak descriptions, remove rows, add extra items, and mark anything as Needs Review." },
            { icon: FileText, title: "Export a professional CSV quote", desc: "One click generates a clean M Performance Parts format CSV, ready to send." },
          ].map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="border bg-card">
              <CardContent className="pt-5 space-y-2">
                <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                <h3 className="font-semibold text-sm">{title}</h3>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-center mb-8">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { step: "1", icon: Upload, title: "Upload photos", desc: "Drag and drop accident photos — up to 20 images per quote." },
            { step: "2", icon: Zap, title: "AI analyses damage", desc: "GPT-4o identifies every damaged zone and maps parts to BMW OEM descriptions." },
            { step: "3", icon: Download, title: "Export your quote", desc: "Review, edit, and download a CSV that matches the M Performance Parts format exactly." },
          ].map(({ step, icon: Icon, title, desc }) => (
            <div key={step} className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-bold">{step}</div>
              <Icon className="w-5 h-5 text-muted-foreground" />
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-center mb-6">Sample output — G80 M3 Collision Quote</h2>
        <div className="relative overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 border-b">
                <tr>
                  {["Estimate Item", "OEM Description", "BMW New (AUD)", "Our Price (AUD)", "Saving", "Category"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SAMPLE_ROWS.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-3 py-2">{row.item}</td>
                    <td className="px-3 py-2 font-medium">{row.desc}</td>
                    <td className="px-3 py-2 text-right">${row.bmwNew}</td>
                    <td className="px-3 py-2 text-right text-green-700 dark:text-green-400 font-medium">${row.ourPrice}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">${row.saving}</td>
                    <td className="px-3 py-2">{row.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background via-background/80 to-transparent flex items-end justify-center pb-4">
            <div className="text-center space-y-2">
              <Lock className="w-6 h-6 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium">Subscribe to see the full quote</p>
            </div>
          </div>
        </div>
      </section>

      <section className="text-center border rounded-xl py-6 bg-muted/30">
        <div className="flex flex-wrap justify-center gap-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-2"><Star className="w-4 h-4 text-yellow-500" /><span>5.97M parts catalogued</span></div>
          <div className="flex items-center gap-2"><Car className="w-4 h-4 text-blue-500" /><span>G20 · G80 · G82 · F8x · E9x and more</span></div>
          <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-green-500" /><span>Used by BMW repair workshops across Australia</span></div>
        </div>
      </section>

      <div className="fixed bottom-0 inset-x-0 z-50 border-t bg-background/95 backdrop-blur-sm py-3 px-4 flex items-center justify-between">
        <div className="text-sm font-medium hidden sm:block">Unlock AI Photo Quotes — save hours per damage assessment</div>
        <Button size="sm" className="ml-auto" onClick={() => navigate("/auth")} data-testid="button-subscribe-sticky">
          <Lock className="w-3.5 h-3.5 mr-1.5" /> Subscribe now
        </Button>
      </div>
      <div className="h-16" />
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ToolPage() {
  const { toast } = useToast();

  const [photos, setPhotos] = useState<{ file: File; preview: string; b64: string }[]>([]);
  const [vin, setVin] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleColour, setVehicleColour] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerPostcode, setCustomerPostcode] = useState("");
  const [activeQuoteId, setActiveQuoteId] = useState<number | null>(null);
  const [editableRows, setEditableRows] = useState<QuoteRow[]>([]);
  const [showAnalysisNotes, setShowAnalysisNotes] = useState(false);
  const [analysisNotes, setAnalysisNotes] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: history = [], isLoading: historyLoading } = useQuery<PhotoQuote[]>({
    queryKey: ["/api/vendor/photo-quote"],
  });

  const analyseMutation = useMutation({
    mutationFn: async () => {
      if (!vehicle) throw new Error("Please select a vehicle model");
      if (photos.length === 0) throw new Error("Please upload at least one photo");
      const totalBytes = photos.reduce((s, p) => s + p.b64.length * 0.75, 0);
      if (totalBytes > 20 * 1024 * 1024) throw new Error("Total photo size exceeds 20 MB. Please remove some photos.");
      const res = await apiRequest("POST", "/api/vendor/photo-quote", {
        vin: vin || undefined,
        vehicle,
        photos: photos.map(p => p.b64),
        vehicleYear: vehicleYear || undefined,
        vehicleColour: vehicleColour || undefined,
        customerName: customerName || undefined,
        customerEmail: customerEmail || undefined,
        customerPhone: customerPhone || undefined,
        customerPostcode: customerPostcode || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setActiveQuoteId(data.quote_id);
      setEditableRows(data.detected_parts ?? []);
      setAnalysisNotes(data.analysis_notes ?? []);
      setShowAnalysisNotes((data.analysis_notes ?? []).length > 0);
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/photo-quote"] });
      toast({ title: "Analysis complete", description: `${data.detected_parts?.length ?? 0} parts identified` });
    },
    onError: (err: any) => {
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeQuoteId) throw new Error("No active quote");
      const res = await apiRequest("PATCH", `/api/vendor/photo-quote/${activeQuoteId}/rows`, {
        quoteRows: editableRows,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/photo-quote"] });
      toast({ title: "Quote saved" });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const allowed = Array.from(files).filter(f => f.type.startsWith("image/")).slice(0, 20 - photos.length);
    if (allowed.length === 0) return;
    const processed = await Promise.all(
      allowed.map(async (file) => {
        const b64 = await fileToBase64(file);
        return { file, preview: URL.createObjectURL(file), b64 };
      })
    );
    setPhotos(prev => [...prev, ...processed].slice(0, 20));
  }, [photos.length]);

  const removePhoto = (i: number) => {
    setPhotos(prev => prev.filter((_, idx) => idx !== i));
  };

  const updateRow = (rowId: string, field: keyof QuoteRow, value: any) => {
    setEditableRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const updated = { ...r, [field]: value };
      if (field === "bmwNew") {
        updated.ourPrice = Math.round(Number(value) * 0.5 * 100) / 100;
        updated.saving = Math.round((Number(value) - updated.ourPrice) * 100) / 100;
      }
      return updated;
    }));
  };

  const removeRow = (rowId: string) => {
    setEditableRows(prev => prev.filter(r => r.id !== rowId));
  };

  const addRow = () => {
    const newRow: QuoteRow = {
      id: crypto.randomUUID(),
      estimateItem: `Item ${editableRows.length + 1}`,
      oemDescription: "",
      oemNumber: null,
      bmwNew: 0,
      ourPrice: 0,
      saving: 0,
      category: "",
      status: "review",
    };
    setEditableRows(prev => [...prev, newRow]);
  };

  const totals = editableRows.reduce(
    (acc, r) => ({ bmwNew: acc.bmwNew + r.bmwNew, ourPrice: acc.ourPrice + r.ourPrice, saving: acc.saving + r.saving }),
    { bmwNew: 0, ourPrice: 0, saving: 0 }
  );

  const downloadCsv = async () => {
    if (!activeQuoteId) return;
    await saveMutation.mutateAsync();
    window.open(`/api/vendor/photo-quote/${activeQuoteId}/csv`, "_blank");
  };

  const loadHistoryQuote = async (q: PhotoQuote) => {
    setActiveQuoteId(q.id);
    setEditableRows(q.quoteRows ?? []);
    setVehicle(q.vehicle);
    setVin(q.vin ?? "");
    toast({ title: "Quote loaded", description: q.vehicle });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Camera className="w-5 h-5 text-blue-600" />
          AI Photo Quote
        </h1>
        <Button variant="outline" size="sm" onClick={() => { setActiveQuoteId(null); setEditableRows([]); setPhotos([]); }} data-testid="button-new-quote">
          <Plus className="w-3.5 h-3.5 mr-1" /> New Quote
        </Button>
      </div>

      {!activeQuoteId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Upload Photos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
                onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                data-testid="dropzone-photos"
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Drag & drop or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1">JPEG / PNG · Max 20 photos · ~20 MB total</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                  data-testid="input-file-photos"
                />
              </div>

              {photos.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {photos.map((p, i) => (
                    <div key={i} className="relative group rounded overflow-hidden border" data-testid={`img-photo-${i}`}>
                      <img src={p.preview} alt="" className="w-full h-16 object-cover" />
                      <button
                        className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removePhoto(i)}
                        data-testid={`button-remove-photo-${i}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Vehicle & Customer Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Vehicle Model *</Label>
                  <Select value={vehicle} onValueChange={setVehicle}>
                    <SelectTrigger data-testid="select-vehicle">
                      <SelectValue placeholder="Select chassis" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHASSIS_LIST.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">VIN (optional)</Label>
                  <Input value={vin} onChange={e => setVin(e.target.value.toUpperCase())} placeholder="17-digit VIN" data-testid="input-vin" />
                </div>
                <div>
                  <Label className="text-xs">Year</Label>
                  <Input value={vehicleYear} onChange={e => setVehicleYear(e.target.value)} placeholder="e.g. 2023" data-testid="input-year" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Colour</Label>
                  <Input value={vehicleColour} onChange={e => setVehicleColour(e.target.value)} placeholder="e.g. Black Sapphire Metallic" data-testid="input-colour" />
                </div>
              </div>

              <div className="border-t pt-3 space-y-2">
                <p className="text-xs text-muted-foreground">Customer details forwarded to MPerformance.parts for fulfilment.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Full name" data-testid="input-customer-name" />
                  </div>
                  <div>
                    <Label className="text-xs">Email</Label>
                    <Input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="email@example.com" data-testid="input-customer-email" />
                  </div>
                  <div>
                    <Label className="text-xs">Phone</Label>
                    <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+61 4xx xxx xxx" data-testid="input-customer-phone" />
                  </div>
                  <div>
                    <Label className="text-xs">Postcode</Label>
                    <Input value={customerPostcode} onChange={e => setCustomerPostcode(e.target.value)} placeholder="2000" data-testid="input-customer-postcode" />
                  </div>
                </div>
              </div>

              <Button
                className="w-full"
                disabled={analyseMutation.isPending || !vehicle || photos.length === 0}
                onClick={() => analyseMutation.mutate()}
                data-testid="button-analyse"
              >
                {analyseMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analysing…</>
                ) : (
                  <><Zap className="w-4 h-4 mr-2" /> Analyse Damage</>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {activeQuoteId && editableRows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Review & Edit Quote</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={addRow} data-testid="button-add-part">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Part
                </Button>
                <Button variant="outline" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-rows">
                  {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                </Button>
                <Button size="sm" onClick={downloadCsv} data-testid="button-export-csv">
                  <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setActiveQuoteId(null); setEditableRows([]); setPhotos([]); setAnalysisNotes([]); }}
                  data-testid="button-reset-quote"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reset
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 border-y">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground w-20">Item</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground min-w-48">OEM Description</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground w-32">OEM #</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground w-24">BMW New</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground w-24">Our Price</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground w-24">Saving</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground w-28">Category</th>
                    <th className="px-2 py-2 text-center font-medium text-muted-foreground w-24">Status</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {editableRows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-quote-${row.id}`}>
                      <td className="px-2 py-1.5">
                        <Input
                          value={row.estimateItem}
                          onChange={e => updateRow(row.id, "estimateItem", e.target.value)}
                          className="h-7 text-xs"
                          data-testid={`input-item-${row.id}`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          value={row.oemDescription}
                          onChange={e => updateRow(row.id, "oemDescription", e.target.value)}
                          className="h-7 text-xs"
                          data-testid={`input-desc-${row.id}`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          value={row.oemNumber ?? ""}
                          onChange={e => updateRow(row.id, "oemNumber", e.target.value || null)}
                          className="h-7 text-xs"
                          placeholder="OEM #"
                          data-testid={`input-oem-${row.id}`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          value={row.bmwNew}
                          onChange={e => updateRow(row.id, "bmwNew", parseFloat(e.target.value) || 0)}
                          className="h-7 text-xs text-right"
                          data-testid={`input-bmwnew-${row.id}`}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium text-green-700 dark:text-green-400">
                        ${row.ourPrice.toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">
                        ${row.saving.toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          value={row.category}
                          onChange={e => updateRow(row.id, "category", e.target.value)}
                          className="h-7 text-xs"
                          data-testid={`input-category-${row.id}`}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <Select value={row.status} onValueChange={v => updateRow(row.id, "status", v)}>
                          <SelectTrigger className="h-7 text-[10px] border-0 shadow-none p-0 justify-center">
                            <StatusBadge status={row.status} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="required">Required</SelectItem>
                            <SelectItem value="optional">Optional</SelectItem>
                            <SelectItem value="review">Review</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(row.id)}
                          data-testid={`button-remove-row-${row.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/50 border-t font-semibold">
                  <tr>
                    <td colSpan={3} className="px-2 py-2 text-xs">GRAND TOTAL</td>
                    <td className="px-2 py-2 text-right text-xs">${totals.bmwNew.toFixed(2)}</td>
                    <td className="px-2 py-2 text-right text-xs text-green-700 dark:text-green-400">${totals.ourPrice.toFixed(2)}</td>
                    <td className="px-2 py-2 text-right text-xs text-muted-foreground">${totals.saving.toFixed(2)}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {analysisNotes.length > 0 && (
        <Card>
          <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowAnalysisNotes(v => !v)}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-500" /> AI Analysis Notes
              </CardTitle>
              {showAnalysisNotes ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </CardHeader>
          {showAnalysisNotes && (
            <CardContent>
              <ul className="text-xs space-y-1 text-muted-foreground">
                {analysisNotes.map((n: any, i: number) => (
                  <li key={i} className="border-b last:border-0 pb-1">{n.damage_location}: {n.notes ?? "—"}</li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Quote History</CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No quotes yet. Analyse some photos to get started.</p>
          ) : (
            <div className="space-y-2">
              {history.map((q) => (
                <div key={q.id} className="flex items-center justify-between border rounded-lg px-3 py-2 hover:bg-muted/30 transition-colors" data-testid={`row-history-${q.id}`}>
                  <div>
                    <p className="text-sm font-medium">{q.vehicle}</p>
                    <p className="text-xs text-muted-foreground">
                      {q.vin ? `VIN: ${q.vin} · ` : ""}
                      {new Date(q.createdAt).toLocaleDateString("en-AU")} ·
                      Our Price: ${q.totalOurPrice.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => loadHistoryQuote(q)} data-testid={`button-load-quote-${q.id}`}>
                      Load
                    </Button>
                    <a href={`/api/vendor/photo-quote/${q.id}/csv`} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`button-dl-csv-${q.id}`}>
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PhotoQuote() {
  const { user, isLoading } = useAuth();

  const isPaidOrAdmin = user?.role === "admin";
  const { data: meData } = useQuery<{ tier?: string } | null>({
    queryKey: ["/api/auth/me/tier"],
    queryFn: async () => {
      if (!user) return null;
      try {
        const res = await fetch("/api/vendor/photo-quote?limit=0", { credentials: "include" });
        if (res.ok) return { tier: "paid" };
        if (res.status === 403) return { tier: "basic" };
        return null;
      } catch {
        return null;
      }
    },
    enabled: !!user && !isPaidOrAdmin,
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasAccess = isPaidOrAdmin || meData?.tier === "paid";

  if (!user || !hasAccess) {
    return <SalesPage />;
  }

  return <ToolPage />;
}
