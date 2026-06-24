import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Car, LogIn, UserPlus, ExternalLink, ArrowLeft } from "lucide-react";
import { SEO } from "@/components/SEO";

const SSO_ERROR_MESSAGES: Record<string, string> = {
  gearswap_denied: "GearSwap login was denied or cancelled",
  no_code: "No authorization code received from GearSwap",
  state_mismatch: "Security check failed — please try again",
  config_error: "SSO is not configured properly",
  token_exchange_failed: "Could not verify your GearSwap identity",
  no_user_data: "Could not retrieve your GearSwap profile",
  user_not_found: "Account link broken — contact support",
  login_failed: "Login failed after GearSwap verification",
  server_error: "Something went wrong — please try again",
};

export default function Login() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { login, register } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const error = params.get("error");
    if (error) {
      toast({
        title: "GearSwap Login Failed",
        description: SSO_ERROR_MESSAGES[error] || "An unknown error occurred",
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/login");
    }
  }, [search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        await login(username, password);
        toast({ title: "Welcome back!" });
      } else {
        await register(username, password);
        toast({ title: "Account created!" });
      }
      navigate("/");
    } catch (err: any) {
      const msg = err.message?.includes(":") ? err.message.split(":").slice(1).join(":").trim() : err.message;
      let errorText = "Something went wrong";
      try { errorText = JSON.parse(msg).error || msg; } catch { errorText = msg; }
      toast({ title: "Error", description: errorText, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email: forgotEmail });
      setForgotSent(true);
    } catch (err: any) {
      const msg = err.message?.includes(":") ? err.message.split(":").slice(1).join(":").trim() : err.message;
      let errorText = "Something went wrong";
      try { errorText = JSON.parse(msg).error || msg; } catch { errorText = msg; }
      toast({ title: "Error", description: errorText, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const titleMap = { login: "Sign In", register: "Create Account", forgot: "Reset Password" } as const;
  const subtitleMap = {
    login: "Sign in to access full part details and pricing",
    register: "Register to unlock pricing and part details",
    forgot: "Enter your email and we'll send you a reset link",
  } as const;

  return (
    <div className="flex items-center justify-center min-h-[80vh] p-4">
      <SEO title="Login — BMV.parts" path="/login" noIndex />
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Car className="w-6 h-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold" data-testid="text-auth-title">
            {titleMap[mode]}
          </h1>
          <p className="text-sm text-muted-foreground">
            {subtitleMap[mode]}
          </p>
        </div>

        {mode === "forgot" ? (
          forgotSent ? (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground" data-testid="text-forgot-sent">
                If an account exists for that email, we've sent a reset link. The link expires in 1 hour.
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => { setMode("login"); setForgotSent(false); setForgotEmail(""); }}
                data-testid="button-back-to-login"
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  data-testid="input-forgot-email"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading} data-testid="button-submit-forgot">
                {loading ? "..." : "Send reset link"}
              </Button>
              <button
                type="button"
                onClick={() => setMode("login")}
                className="flex items-center justify-center gap-1 w-full text-sm text-muted-foreground hover:text-foreground"
                data-testid="button-cancel-forgot"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
              </button>
            </form>
          )
        ) : (
        <>
        {mode === "login" && (
          <>
            <a
              href="/api/auth/gearswap"
              className="flex items-center justify-center gap-2 w-full rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
              data-testid="button-login-gearswap"
            >
              <ExternalLink className="w-4 h-4" />
              Login with GearSwap
            </a>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">{mode === "register" ? "Email" : "Email or Username"}</Label>
            <Input
              id="username"
              type={mode === "register" ? "email" : "text"}
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={mode === "register" ? "you@example.com" : "Email or username"}
              required
              data-testid="input-username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === "register" ? "Min 6 characters" : "Enter password"}
              required
              minLength={mode === "register" ? 6 : undefined}
              data-testid="input-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading} data-testid="button-submit-auth">
            {loading ? "..." : mode === "login" ? (
              <><LogIn className="w-4 h-4 mr-2" /> Sign In</>
            ) : (
              <><UserPlus className="w-4 h-4 mr-2" /> Create Account</>
            )}
          </Button>
          {mode === "login" && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setMode("forgot")}
                className="text-sm text-primary hover:underline"
                data-testid="link-forgot-password"
              >
                Forgot password?
              </button>
            </div>
          )}
        </form>

        <div className="text-center text-sm">
          {mode === "login" ? (
            <p className="text-muted-foreground">
              Don't have an account?{" "}
              <button onClick={() => setMode("register")} className="text-primary hover:underline font-medium" data-testid="button-switch-register">
                Register
              </button>
            </p>
          ) : (
            <p className="text-muted-foreground">
              Already have an account?{" "}
              <button onClick={() => setMode("login")} className="text-primary hover:underline font-medium" data-testid="button-switch-login">
                Sign in
              </button>
            </p>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}
