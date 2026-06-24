import { useState, useEffect } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Car, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { SEO } from "@/components/SEO";

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [tokenStatus, setTokenStatus] = useState<"checking" | "valid" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const t = params.get("token") || "";
    setToken(t);
    if (!t) {
      setTokenStatus("invalid");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/auth/reset-password/validate?token=${encodeURIComponent(t)}`);
        const data = await res.json();
        setTokenStatus(data.valid ? "valid" : "invalid");
      } catch {
        setTokenStatus("invalid");
      }
    })();
  }, [search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", { token, password });
      setDone(true);
      toast({ title: "Password reset", description: "You can now sign in with your new password." });
      setTimeout(() => navigate("/login"), 1500);
    } catch (err: any) {
      const msg = err.message?.includes(":") ? err.message.split(":").slice(1).join(":").trim() : err.message;
      let errorText = "Something went wrong";
      try { errorText = JSON.parse(msg).error || msg; } catch { errorText = msg; }
      toast({ title: "Error", description: errorText, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh] p-4">
      <SEO title="Reset Password — BMV.parts" path="/reset-password" noIndex />
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Car className="w-6 h-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold" data-testid="text-reset-title">Reset Password</h1>
        </div>

        {tokenStatus === "checking" && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground" data-testid="status-checking">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking link...
          </div>
        )}

        {tokenStatus === "invalid" && (
          <div className="space-y-4">
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm flex gap-2" data-testid="status-invalid">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div>
                This reset link is invalid or has expired. Please request a new password reset link from the sign-in page.
              </div>
            </div>
            <Link href="/login">
              <Button className="w-full" data-testid="button-go-login">Back to sign in</Button>
            </Link>
          </div>
        )}

        {tokenStatus === "valid" && !done && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                required
                minLength={6}
                data-testid="input-new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Re-enter new password"
                required
                minLength={6}
                data-testid="input-confirm-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting} data-testid="button-submit-reset">
              {submitting ? "Resetting..." : "Reset password"}
            </Button>
          </form>
        )}

        {tokenStatus === "valid" && done && (
          <div className="rounded-md border border-green-500/30 bg-green-500/5 p-4 text-sm flex gap-2" data-testid="status-success">
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
            <div>Password updated. Redirecting to sign in...</div>
          </div>
        )}
      </div>
    </div>
  );
}
