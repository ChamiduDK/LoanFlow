import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LockKeyhole, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api/client";
import { normalizeEmail, resolveAccessState, resolvePostAuthPath } from "@/lib/auth";
import { supabaseClient } from "@/lib/supabase/client";
import logo from "@/assets/logo.png";

type MePayload = {
  profile?: {
    is_admin?: boolean;
    is_approved?: boolean;
  } | null;
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: normalizeEmail(email),
        password,
      });

      if (error) {
        toast({
          title: "Sign in failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Signed in",
        description: "Welcome back.",
      });

      const state = location.state as { from?: string } | null;
      let access = { isAdmin: false, isApproved: true };

      try {
        const me = await apiFetch<MePayload>("/api/me");
        access = resolveAccessState(me.profile);
      } catch {
        access = { isAdmin: false, isApproved: true };
      }

      navigate(resolvePostAuthPath(state?.from, access), { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
        <div className="relative hidden h-full md:block">
          <img
            className="h-full w-full object-cover"
            src="https://raw.githubusercontent.com/prebuiltui/prebuiltui/main/assets/login/leftSideImage.png"
            alt="Authentication visual"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-black/45 via-black/20 to-transparent" />
          <img
            src={logo}
            alt="LoanFlow"
            className="absolute left-8 top-8 h-10 w-auto object-contain drop-shadow-md"
          />
        </div>

        <div className="flex w-full items-center justify-center px-4 py-8 sm:px-8">
          <form
            className="w-full max-w-md rounded-2xl border border-border/70 bg-card/85 p-6 shadow-lg backdrop-blur sm:p-8"
            onSubmit={onSubmit}
          >
            <img src={logo} alt="LoanFlow" className="mx-auto h-10 w-auto object-contain md:h-11" />
            <h2 className="mt-6 text-center text-3xl font-semibold sm:text-4xl">Sign in</h2>
            <p className="mt-3 text-center text-sm text-muted-foreground">
              Welcome back! Please sign in to continue
            </p>

            <button
              type="button"
              className="mt-8 flex h-12 w-full items-center justify-center rounded-full border border-border bg-muted/40 transition-colors hover:bg-muted/70"
            >
              <img
                src="https://raw.githubusercontent.com/prebuiltui/prebuiltui/main/assets/login/googleLogo.svg"
                alt="googleLogo"
              />
            </button>

            <div className="my-5 flex w-full items-center gap-4">
              <div className="h-px w-full bg-border" />
              <p className="w-full text-nowrap text-sm text-muted-foreground">or sign in with email</p>
              <div className="h-px w-full bg-border" />
            </div>

            <div className="flex h-12 w-full items-center gap-2 overflow-hidden rounded-full border border-input bg-background/70 pl-4 pr-3">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email id"
                className="h-full w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/80 outline-none"
                required
                autoComplete="email"
              />
            </div>

            <div className="mt-6 flex h-12 w-full items-center gap-2 overflow-hidden rounded-full border border-input bg-background/70 pl-4 pr-3">
              <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="h-full w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/80 outline-none"
                required
                autoComplete="current-password"
              />
            </div>

            <div className="mt-8 flex w-full items-center justify-between text-muted-foreground">
              <div className="flex items-center gap-2">
                <input className="h-4 w-4 accent-primary" type="checkbox" id="remember-login" />
                <label className="text-sm" htmlFor="remember-login">
                  Remember me
                </label>
              </div>
              <button
                type="button"
                className="text-sm underline"
                onClick={() =>
                  toast({
                    title: "Password reset",
                    description: "Password reset flow is not configured yet.",
                  })
                }
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              className="mt-8 h-11 w-full rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? "Signing in..." : "Login"}
            </button>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link to="/signup" className="font-medium text-primary hover:underline">
                Sign up
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
