import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api/client";
import { normalizeEmail, resolvePostAuthPath } from "@/lib/auth";
import { supabaseClient } from "@/lib/supabase/client";

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
      let isAdmin = false;
      let isApproved = false;

      try {
        const me = await apiFetch<MePayload>("/api/me");
        isAdmin = Boolean(me.profile?.is_admin);
        isApproved = Boolean(me.profile?.is_approved);
      } catch {
        isAdmin = false;
        isApproved = false;
      }

      navigate(resolvePostAuthPath(state?.from, { isAdmin, isApproved }), { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-2 py-8 md:px-4">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl overflow-hidden rounded-2xl border border-border/70 bg-card shadow-md lg:grid-cols-2">
        <div className="hidden border-r border-border bg-muted/35 p-10 lg:flex lg:flex-col lg:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-foreground">LoanFlow</span>
          </div>
          <div className="space-y-4">
            <h2 className="text-3xl font-semibold text-foreground">Welcome back to your lending workspace</h2>
            <p className="text-sm text-muted-foreground">
              Continue applications, manage documents, and track approvals across banks.
            </p>
            <div className="space-y-2 text-sm text-foreground">
              <p className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-success" /> Secure account access</p>
              <p className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-muted-foreground" /> AI-driven recommendation engine</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Trusted by SME founders and finance teams across Sri Lanka.</p>
        </div>

        <div className="flex items-center justify-center p-6 sm:p-10">
          <Card className="w-full max-w-md border-0 shadow-none">
            <CardHeader className="px-0 text-left">
              <div className="mb-2 flex items-center gap-2 lg:hidden">
                <span className="font-semibold">LoanFlow</span>
              </div>
              <CardTitle className="text-2xl">Sign In</CardTitle>
              <CardDescription>Access your dashboard and continue your loan journey.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-0">
              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
                </div>
                <Button className="w-full" type="submit" disabled={submitting}>
                  {submitting ? "Signing in..." : "Sign In"}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground">
                Do not have an account? <Link to="/signup" className="font-medium text-primary hover:underline">Create one</Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
