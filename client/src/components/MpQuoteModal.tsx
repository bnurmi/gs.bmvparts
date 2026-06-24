import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Loader2, CheckCircle2, AlertCircle, MessageSquareQuote } from "lucide-react";

const quoteSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(1, "Phone number is required"),
  shippingPostcode: z.string().optional(),
  notes: z.string().optional(),
});

type QuoteFormValues = z.infer<typeof quoteSchema>;

interface MpQuoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partNumber: string;
  partDescription: string;
  vehicleModel?: string;
  vehicleSeries?: string;
  vehicleYear?: number;
}

export function MpQuoteModal({
  open,
  onOpenChange,
  partNumber,
  partDescription,
  vehicleModel,
  vehicleSeries,
  vehicleYear,
}: MpQuoteModalProps) {
  const [state, setState] = useState<"form" | "submitting" | "success" | "error">("form");
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      shippingPostcode: "",
      notes: "",
    },
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setTimeout(() => {
        setState("form");
        setReferenceNumber(null);
        setErrorMessage(null);
        form.reset();
      }, 200);
    }
    onOpenChange(open);
  };

  const onSubmit = async (values: QuoteFormValues) => {
    setState("submitting");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/partner/mp-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...values,
          partNumber,
          partDescription,
          vehicleMake: "BMW",
          ...(vehicleModel ? { vehicleModel } : {}),
          ...(vehicleSeries ? { vehicleSeries } : {}),
          ...(vehicleYear ? { vehicleYear } : {}),
        }),
      });
      let json: any = {};
      try { json = await res.json(); } catch {}
      if (!res.ok) {
        setErrorMessage(json?.error || "Quote submission failed. Please try again.");
        setState("error");
        return;
      }
      setReferenceNumber(json.referenceNumber || null);
      setState("success");
    } catch {
      setErrorMessage("Could not reach MPerformance.parts. Please try again later.");
      setState("error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md" data-testid="modal-mp-quote">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareQuote className="w-5 h-5 text-blue-600" />
            Request a Quote
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{partDescription}</span>
            <span className="text-muted-foreground"> · </span>
            <span className="font-mono text-xs text-muted-foreground">{partNumber}</span>
            <br />
            <span className="text-xs">Via MPerformance.parts — a team member will follow up with pricing and availability.</span>
          </DialogDescription>
        </DialogHeader>

        {state === "success" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center" data-testid="quote-success">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <div>
              <p className="font-semibold text-lg">Quote request received!</p>
              <p className="text-sm text-muted-foreground mt-1">
                The MPerformance.parts team will be in touch with availability and pricing.
              </p>
            </div>
            {referenceNumber && (
              <div className="border rounded-lg px-4 py-2 bg-muted/50 text-sm mt-1">
                <span className="text-muted-foreground">Reference: </span>
                <span className="font-mono font-semibold" data-testid="text-quote-reference">{referenceNumber}</span>
              </div>
            )}
            <Button variant="outline" onClick={() => handleOpenChange(false)} className="mt-2" data-testid="button-close-success">
              Close
            </Button>
          </div>
        )}

        {state === "error" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center" data-testid="quote-error">
            <AlertCircle className="w-10 h-10 text-destructive" />
            <div>
              <p className="font-semibold">Something went wrong</p>
              <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
            </div>
            <div className="flex gap-2 mt-2">
              <Button variant="outline" onClick={() => setState("form")} data-testid="button-retry-quote">Try again</Button>
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {(state === "form" || state === "submitting") && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" data-testid="form-mp-quote">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Jane Smith" {...field} data-testid="input-quote-full-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="jane@example.com" {...field} data-testid="input-quote-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="+61 400 000 000" {...field} data-testid="input-quote-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="shippingPostcode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Shipping Postcode <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="2000" {...field} data-testid="input-quote-postcode" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Notes <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g. I need this urgently, or I need 2 units"
                        className="resize-none"
                        rows={3}
                        {...field}
                        data-testid="input-quote-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2 pt-1">
                <Button
                  type="submit"
                  disabled={state === "submitting"}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-2"
                  data-testid="button-submit-quote"
                >
                  {state === "submitting" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting…
                    </>
                  ) : (
                    "Submit Quote Request"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={state === "submitting"}
                  data-testid="button-cancel-quote"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
