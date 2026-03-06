import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LockKeyhole, Mail, Phone, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";
import { normalizeEmail, resolveAccessState, resolvePostAuthPath } from "@/lib/auth";
import logo from "@/assets/logo.png";
import home1 from "@/assets/HOME1.png";
import home2 from "@/assets/HOME2.png";
import home3 from "@/assets/HOME3.png";

const HERO_IMAGES = [home1, home2, home3];
const IMAGE_CHANGE_INTERVAL_MS = 3500;

export default function SignUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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

    const firstName = first.trim();
    const lastName = last.trim();
    const fullName = `${firstName} ${lastName}`.trim();
    const normalizedPhone = phone.trim();

    const { data, error } = await supabaseClient.auth.signUp({
      email: normalizeEmail(email),
      password,
      options: {
        data: {
          full_name: fullName || null,
          phone: normalizedPhone || null,
        },
      },
    });

    if (error) {
      setSubmitting(false);
      toast({
        title: "Account creation failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    try {
      if (data.session?.access_token) {
        await apiFetch("/api/profile", {
          method: "PUT",
          body: JSON.stringify({
            full_name: fullName || null,
            phone: normalizedPhone || null,
          }),
        });
      }
    } catch {
      // profile update can be completed later in settings
    } finally {
      setSubmitting(false);
    }

    if (!data.session) {
      toast({
        title: "Check your email",
        description: "Verify your email address, then sign in.",
      });
      navigate("/login");
      return;
    }

    toast({
      title: "Account created",
      description: "Welcome to LoanFlow.",
    });

    const state = location.state as { from?: string } | null;
    let access = { isAdmin: false, isApproved: true };

    try {
      const me = await apiFetch<{ profile?: { is_admin?: boolean; is_approved?: boolean } | null }>("/api/me");
      access = resolveAccessState(me.profile);
    } catch {
      access = { isAdmin: false, isApproved: true };
    }

    navigate(resolvePostAuthPath(state?.from, access), { replace: true });
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="grid min-h-[100dvh] grid-cols-1 md:grid-cols-2">
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

        <div className="flex w-full items-center justify-center px-4 py-4 sm:px-8 sm:py-6">
          <form
            className="w-full max-w-sm rounded-2xl border border-border/70 bg-card/85 p-4 shadow-lg backdrop-blur sm:max-w-md sm:p-6"
            onSubmit={onSubmit}
          >
            <Link to="/" aria-label="Go to home" className="mx-auto block w-fit">
              <img src={logo} alt="LoanFlow" className="h-10 w-auto object-contain md:h-11" />
            </Link>
            <h2 className="mt-4 text-center text-2xl font-semibold sm:text-4xl">Sign up</h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Create your account to start your loan journey
            </p>

            <div className="my-4 flex w-full items-center gap-3 sm:mt-5">
              <div className="h-px w-full bg-border" />
              <p className="shrink-0 whitespace-nowrap text-xs text-muted-foreground sm:text-sm">Create your account with email</p>
              <div className="h-px w-full bg-border" />
            </div>

            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex h-11 items-center gap-2 overflow-hidden rounded-full border border-input bg-background/70 pl-4 pr-3 sm:h-12">
                <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  id="first"
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                  placeholder="First name"
                  className="h-full w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/80 outline-none"
                  required
                  autoComplete="given-name"
                />
              </div>
              <div className="flex h-11 items-center gap-2 overflow-hidden rounded-full border border-input bg-background/70 pl-4 pr-3 sm:h-12">
                <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  id="last"
                  value={last}
                  onChange={(e) => setLast(e.target.value)}
                  placeholder="Last name"
                  className="h-full w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/80 outline-none"
                  required
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className="mt-3 flex h-11 w-full items-center gap-2 overflow-hidden rounded-full border border-input bg-background/70 pl-4 pr-3 sm:mt-4 sm:h-12">
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
              <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number (optional)"
                className="h-full w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/80 outline-none"
                autoComplete="tel"
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
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              className="mt-4 h-11 w-full rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:mt-5"
              disabled={submitting}
            >
              {submitting ? "Creating account..." : "Create Account"}
            </button>

            <p className="mt-2 text-center text-sm text-muted-foreground sm:mt-3">
              Already have an account?{" "}
              <Link to="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
