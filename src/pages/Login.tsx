import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, ShieldCheck, Sparkles } from "lucide-react";

export default function Login() {
  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl overflow-hidden rounded-2xl border border-border/70 bg-card shadow-lg lg:grid-cols-2">
        <div className="hidden bg-gradient-to-br from-primary to-info p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
              <Building2 className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold">LankaLoan</span>
          </div>
          <div className="space-y-4">
            <h2 className="text-3xl font-semibold">Welcome back to your lending workspace</h2>
            <p className="text-sm text-primary-foreground/85">
              Continue applications, manage documents, and track approvals across banks.
            </p>
            <div className="space-y-2 text-sm text-primary-foreground/90">
              <p className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Secure account access</p>
              <p className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4" /> AI-driven recommendation engine</p>
            </div>
          </div>
          <p className="text-xs text-primary-foreground/70">Trusted by SME founders and finance teams across Sri Lanka.</p>
        </div>

        <div className="flex items-center justify-center p-6 sm:p-10">
          <Card className="w-full max-w-md border-0 shadow-none">
            <CardHeader className="px-0 text-left">
              <div className="mb-2 flex items-center gap-2 lg:hidden">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Building2 className="h-4 w-4" />
                </div>
                <span className="font-semibold">LankaLoan</span>
              </div>
              <CardTitle className="text-2xl">Sign In</CardTitle>
              <CardDescription>Access your dashboard and continue your loan journey.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-0">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="Enter your password" />
              </div>
              <Button className="w-full" asChild>
                <Link to="/dashboard">Sign In</Link>
              </Button>
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
