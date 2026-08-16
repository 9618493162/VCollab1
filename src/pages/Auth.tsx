import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/use-auth";
import { useConvex, useMutation } from "convex/react";
import { ArrowRight, Github, Loader2, Mail, User, UserX } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function friendlyError(raw: unknown, fallback: string) {
  const message = raw instanceof Error ? raw.message : String(raw);
  const lower = message.toLowerCase();
  if (lower.includes("invalid") || lower.includes("email")) {
    return "Please enter a valid email address.";
  }
  if (
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("unavailable") ||
    lower.includes("failed to connect")
  ) {
    return "Unable to connect. Please try again.";
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const mode: "signin" | "register" =
    searchParams.get("mode") === "register" ? "register" : "signin";
  const convex = useConvex();
  const updateProfile = useMutation(api.settings.updateProfile);
  const [step, setStep] = useState<"signIn" | { email: string; name?: string }>(
    "signIn",
  );
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [emailExists, setEmailExists] = useState<boolean | null>(null);

  // Duplicate-account protection (register mode): debounce a real backend
  // check so users creating an account learn early if one already exists.
  useEffect(() => {
    if (mode !== "register") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEmailExists(null);
      return;
    }
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setEmailExists(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      convex
        .query(api.users.emailExists, { email: trimmed })
        .then((exists) => {
          if (!cancelled) setEmailExists(exists);
        })
        .catch(() => {
          if (!cancelled) setEmailExists(null);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [email, mode, convex]);

  const switchMode = (next: "signin" | "register") => {
    if (next === mode) return;
    setStep("signIn");
    setError(null);
    const params = new URLSearchParams(searchParams);
    if (next === "signin") params.delete("mode");
    else params.set("mode", "register");
    setSearchParams(params, { replace: true });
  };

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === "register" && emailExists === true) {
      setError("An account with this email already exists. Please sign in instead.");
      return;
    }
    if (mode === "register" && name.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({
        email: formData.get("email") as string,
        name: mode === "register" ? name.trim() : undefined,
      });
      setIsLoading(false);
    } catch (error) {
      console.error("Email sign-in error:", error);
      setError(
        friendlyError(error, "We couldn't send a verification code. Please try again."),
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      // Email-OTP doesn't forward custom profile fields (convex-auth#166), so
      // persist the name captured during registration with the real profile
      // mutation. A failure here doesn't block sign-in — the onboarding
      // wizard collects the name later if needed.
      const pendingName = typeof step === "string" ? undefined : step.name;
      if (pendingName) {
        try {
          await updateProfile({ name: pendingName });
        } catch (error) {
          console.warn("Couldn't save name after sign-in:", error);
        }
      }
      navigate(redirect);
    } catch (error) {
      console.error("OTP verification error:", error);
      setError("The verification code you entered is incorrect.");
      setIsLoading(false);
      setOtp("");
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (error) {
      console.error("Guest login error:", error);
      setError(friendlyError(error, "Failed to sign in as guest. Please try again."));
      setIsLoading(false);
    }
  };

  const handleGitHubLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Starts the real GitHub OAuth flow; lands back on `redirect` after auth.
      await signIn("github", { redirectTo: redirect });
    } catch (error) {
      console.error("GitHub login error:", error);
      setError(
        "GitHub sign-in failed — check that AUTH_GITHUB_ID / AUTH_GITHUB_SECRET are in the Keys tab and the OAuth app's callback URL is exactly https://secret-bird-498.convex.site/api/auth/callback/github",
      );
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Starts the real Google OAuth flow; lands back on `redirect` after auth.
      await signIn("google", { redirectTo: redirect });
    } catch (error) {
      console.error("Google login error:", error);
      setError(
        "Google sign-in failed — check that AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET are in the Keys tab and the OAuth client's redirect URI is exactly https://secret-bird-498.convex.site/api/auth/callback/google",
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {/* ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="aurora-blob absolute -top-32 left-1/4 size-[480px] rounded-full bg-indigo-600/20 blur-[130px]" />
        <div className="aurora-blob absolute -bottom-40 right-1/4 size-[420px] rounded-full bg-fuchsia-500/15 blur-[130px]" style={{ animationDelay: "-7s" }} />
        <div className="hero-grid absolute inset-0" />
      </div>

      <div className="relative z-10 flex items-center justify-between px-6 py-5">
        <button type="button" onClick={() => navigate("/")}>
          <Logo />
        </button>
        <ThemeToggle />
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <Card className="glass-float depth-3 rounded-3xl border-none">
            {step === "signIn" ? (
              <>
                <CardHeader className="text-center">
                  <CardTitle className="font-display text-xl font-bold tracking-tight">
                    {mode === "register" ? "Create your account" : "Welcome back"}
                  </CardTitle>
                  <CardDescription>
                    {mode === "register"
                      ? "Enter your name and email and we'll send a code to get you started"
                      : "Sign in to continue to VCollab — we'll send a sign-in code"}
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleEmailSubmit}>
                  <CardContent>
                    {mode === "register" && (
                      <div className="relative mb-2">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          name="name"
                          placeholder="Full name"
                          type="text"
                          autoComplete="name"
                          className="h-11 rounded-xl pl-9"
                          disabled={isLoading}
                          required
                          minLength={2}
                          maxLength={60}
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                    )}
                    <div className="relative flex items-center gap-2">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          name="email"
                          placeholder="name@example.com"
                          type="email"
                          className="h-11 rounded-xl pl-9"
                          disabled={isLoading}
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                      <Button
                        type="submit"
                        variant="outline"
                        size="icon"
                        aria-label="Continue"
                        className="h-11 w-11 rounded-xl"
                        disabled={isLoading || (mode === "register" && emailExists === true)}
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowRight className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {emailExists === true && (
                      <p className="mt-2 text-sm text-amber-500">
                        An account with this email already exists.{" "}
                        <button
                          type="button"
                          onClick={() => switchMode("signin")}
                          className="font-medium underline underline-offset-2 transition-colors hover:text-primary"
                        >
                          Sign in instead
                        </button>
                      </p>
                    )}
                    {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

                    <div className="mt-5">
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-border/60" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-background/60 px-2 text-muted-foreground">
                            Or
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 w-full rounded-xl"
                          onClick={() => void handleGoogleLogin()}
                          disabled={isLoading}
                        >
                          <GoogleIcon className="mr-2 h-4 w-4" />
                          Continue with Google
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 w-full rounded-xl"
                          onClick={() => void handleGitHubLogin()}
                          disabled={isLoading}
                        >
                          <Github className="mr-2 h-4 w-4" />
                          Continue with GitHub
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 w-full rounded-xl"
                          onClick={() => void handleGuestLogin()}
                          disabled={isLoading}
                        >
                          <UserX className="mr-2 h-4 w-4" />
                          Continue as Guest
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </form>
              </>
            ) : (
              <>
                <CardHeader className="text-center">
                  <CardTitle className="font-display text-xl font-bold tracking-tight">
                    Check your email
                  </CardTitle>
                  <CardDescription>
                    We've sent a code to {step.email}
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleOtpSubmit}>
                  <CardContent>
                    <input type="hidden" name="email" value={step.email} />
                    <input type="hidden" name="name" value={step.name ?? ""} />
                    <input type="hidden" name="code" value={otp} />

                    <div className="flex justify-center">
                      <InputOTP
                        value={otp}
                        onChange={setOtp}
                        maxLength={6}
                        disabled={isLoading}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && otp.length === 6 && !isLoading) {
                            const form = (e.target as HTMLElement).closest("form");
                            if (form) form.requestSubmit();
                          }
                        }}
                      >
                        <InputOTPGroup>
                          {Array.from({ length: 6 }).map((_, index) => (
                            <InputOTPSlot key={index} index={index} />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    {error && (
                      <p className="mt-2 text-center text-sm text-destructive">{error}</p>
                    )}
                    <p className="mt-4 text-center text-sm text-muted-foreground">
                      Didn't receive a code?{" "}
                      <Button
                        variant="link"
                        className="h-auto p-0"
                        onClick={() => setStep("signIn")}
                      >
                        Try again
                      </Button>
                    </p>
                  </CardContent>
                  <CardFooter className="flex-col gap-2">
                    <Button
                      type="submit"
                      className="press w-full rounded-xl btn-glow"
                      disabled={isLoading || otp.length !== 6}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        <>
                          Verify code
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setStep("signIn")}
                      disabled={isLoading}
                      className="w-full"
                    >
                      Use different email
                    </Button>
                  </CardFooter>
                </form>
              </>
            )}

            <div className="rounded-b-2xl border-t border-border/60 bg-background/50 px-6 py-3.5">
              <p className="text-center text-xs text-muted-foreground">
                {mode === "register" ? (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("signin")}
                      disabled={isLoading}
                      className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-primary"
                    >
                      Sign in
                    </button>
                  </>
                ) : (
                  <>
                    New to VCollab?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("register")}
                      disabled={isLoading}
                      className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-primary"
                    >
                      Create account
                    </button>
                  </>
                )}
              </p>
              <p className="mt-2 text-center text-xs text-muted-foreground/70">
                Secured by{" "}
                <a
                  href="https://freebuff.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline transition-colors hover:text-primary"
                >
                  freebuff.com
                </a>
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </svg>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
