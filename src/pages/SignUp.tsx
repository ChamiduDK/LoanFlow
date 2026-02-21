import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, CheckCircle2 } from "lucide-react";

export default function SignUp() {
  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl overflow-hidden rounded-2xl border border-border/70 bg-card shadow-md lg:grid-cols-2">
        <div className="hidden border-r border-border bg-muted/35 p-10 lg:flex lg:flex-col lg:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground">
              <Building2 className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold text-foreground">SME Loan Hub</span>
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
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Building2 className="h-4 w-4" />
                </div>
                <span className="font-semibold">SME Loan Hub</span>
              </div>
              <CardTitle className="text-2xl">Create Account</CardTitle>
              <CardDescription>Start comparing SME loan offers in minutes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-0">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="first">First Name</Label>
                  <Input id="first" placeholder="Kamal" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last">Last Name</Label>
                  <Input id="last" placeholder="Perera" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" placeholder="+94 7X XXX XXXX" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="Create a secure password" />
              </div>
              <Button className="w-full" asChild>
                <Link to="/dashboard">Create Account</Link>
              </Button>
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
