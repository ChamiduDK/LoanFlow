import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LockKeyhole, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api/client";
import { normalizeEmail, resolveAccessState, resolvePostAuthPath } from "@/lib/auth";
import { supabaseClient } from "@/lib/supabase/client";
import logo from "@/assets/logo.png";
import home1 from "@/assets/HOME1.png";
import home2 from "@/assets/HOME2.png";
import home3 from "@/assets/HOME3.png";

type MePayload = {
  profile?: {
    is_admin?: boolean;
    is_approved?: boolean;
  } | null;
};

const HERO_IMAGES = [home1, home2, home3];
const IMAGE_CHANGE_INTERVAL_MS = 3500;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveImageIndex((currentIndex) => (currentIndex + 1) % HERO_IMAGES.length);
    }, IMAGE_CHANGE_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

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
    <div className="h-screen min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="grid h-full grid-cols-1 md:grid-cols-2">
        <div className="relative hidden h-full md:block">
          {HERO_IMAGES.map((image, index) => (
            <img
              key={image}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-in-out ${
                index === activeImageIndex ? "opacity-100" : "opacity-0"
              }`}
              src={image}
              alt={`Authentication visual ${index + 1}`}
              loading={index === 0 ? "eager" : "lazy"}
              decoding="async"
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-tr from-black/45 via-black/20 to-transparent" />
          <Link to="/" aria-label="Go to home" className="absolute left-8 top-8">
            <img src={logo} alt="LoanFlow" className="h-10 w-auto object-contain drop-shadow-md" />
          </Link>
        </div>

        <div className="flex h-full w-full items-center justify-center overflow-hidden px-4 py-3 sm:px-8 sm:py-6">
          <form
            className="w-full max-w-sm rounded-2xl border border-border/70 bg-card/85 p-4 shadow-lg backdrop-blur sm:max-w-md sm:p-6"
            onSubmit={onSubmit}
          >
            <Link to="/" aria-label="Go to home" className="mx-auto block w-fit">
              <img src={logo} alt="LoanFlow" className="h-10 w-auto object-contain md:h-11" />
            </Link>
            <h2 className="mt-4 text-center text-2xl font-semibold sm:text-4xl">Sign in</h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Welcome back! Please sign in to continue
            </p>

            <button
              type="button"
              className="mt-4 flex h-10 w-full items-center justify-center rounded-full border border-border bg-muted/40 transition-colors hover:bg-muted/70 sm:mt-5 sm:h-11"
            >
              <img
                src="https://raw.githubusercontent.com/prebuiltui/prebuiltui/main/assets/login/googleLogo.svg"
                alt="googleLogo"
              />
            </button>

            <div className="my-4 flex w-full items-center gap-3">
              <div className="h-px w-full bg-border" />
              <p className="shrink-0 whitespace-nowrap text-xs text-muted-foreground sm:text-sm">or sign in with email</p>
              <div className="h-px w-full bg-border" />
            </div>

            <div className="flex h-11 w-full items-center gap-2 overflow-hidden rounded-full border border-input bg-background/70 pl-4 pr-3 sm:h-12">
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

            <div className="mt-3 flex h-11 w-full items-center gap-2 overflow-hidden rounded-full border border-input bg-background/70 pl-4 pr-3 sm:mt-4 sm:h-12">
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

            <div className="mt-4 flex w-full flex-col items-start gap-2 text-muted-foreground min-[420px]:mt-5 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
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
              className="mt-4 h-11 w-full rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:mt-5"
              disabled={submitting}
            >
              {submitting ? "Signing in..." : "Login"}
            </button>
            <p className="mt-2 text-center text-sm text-muted-foreground sm:mt-3">
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
