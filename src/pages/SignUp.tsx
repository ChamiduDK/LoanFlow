import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";
import { normalizeEmail, resolvePostAuthPath } from "@/lib/auth";

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
    navigate(resolvePostAuthPath(state?.from, false), { replace: true });
  };

  return (
    <div className="min-h-screen bg-background px-2 py-8 md:px-4">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl overflow-hidden rounded-2xl border border-border/70 bg-card shadow-md lg:grid-cols-2">
        <div className="hidden border-r border-border bg-muted/35 p-10 lg:flex lg:flex-col lg:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-foreground">LoanFlow</span>
          </div>
          <div className="space-y-4">
            <h2 className="text-3xl font-semibold text-foreground">Create your SME lending account</h2>
            <p className="text-sm text-muted-foreground">
              Get personalized lender recommendations, document tracking, and repayment visibility.
            </p>
            <div className="space-y-2 text-sm text-foreground">
              <p className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /> Compare ranked lender options</p>
              <p className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /> Upload and verify required documents</p>
              <p className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /> Track approval and repayment flow</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">No setup fee. Start with your first application today.</p>
        </div>

        <div className="flex items-center justify-center p-6 sm:p-10">
          <Card className="w-full max-w-md border-0 shadow-none">
            <CardHeader className="px-0 text-left">
              <div className="mb-2 flex items-center gap-2 lg:hidden">
                <span className="font-semibold">LoanFlow</span>
              </div>
              <CardTitle className="text-2xl">Create Account</CardTitle>
              <CardDescription>Start comparing SME loan offers in minutes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-0">
              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="first">First Name</Label>
                    <Input id="first" value={first} onChange={(e) => setFirst(e.target.value)} required autoComplete="given-name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last">Last Name</Label>
                    <Input id="last" value={last} onChange={(e) => setLast(e.target.value)} required autoComplete="family-name" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
                </div>
                <Button className="w-full" type="submit" disabled={submitting}>
                  {submitting ? "Creating account..." : "Create Account"}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account? <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
