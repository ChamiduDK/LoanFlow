import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LockKeyhole, Mail, Phone, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";
import { normalizeEmail, resolvePostAuthPath } from "@/lib/auth";
import logo from "@/assets/logo.png";

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
    navigate(resolvePostAuthPath(state?.from, { isAdmin: false, isApproved: false }), { replace: true });
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
            <h2 className="mt-6 text-center text-3xl font-semibold sm:text-4xl">Sign up</h2>
            <p className="mt-3 text-center text-sm text-muted-foreground">
              Create your account to start your loan journey
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
              <p className="w-full text-nowrap text-sm text-muted-foreground">or sign up with email</p>
              <div className="h-px w-full bg-border" />
            </div>

            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex h-12 items-center gap-2 overflow-hidden rounded-full border border-input bg-background/70 pl-4 pr-3">
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
              <div className="flex h-12 items-center gap-2 overflow-hidden rounded-full border border-input bg-background/70 pl-4 pr-3">
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

            <div className="mt-4 flex h-12 w-full items-center gap-2 overflow-hidden rounded-full border border-input bg-background/70 pl-4 pr-3">
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

            <div className="mt-4 flex h-12 w-full items-center gap-2 overflow-hidden rounded-full border border-input bg-background/70 pl-4 pr-3">
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

            <div className="mt-4 flex h-12 w-full items-center gap-2 overflow-hidden rounded-full border border-input bg-background/70 pl-4 pr-3">
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
              className="mt-8 h-11 w-full rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? "Creating account..." : "Create Account"}
            </button>

            <p className="mt-4 text-center text-sm text-muted-foreground">
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
