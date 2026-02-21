import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ProcessBeamSection from "@/components/home/process-beam-section";
import {
  ArrowRight,
  Building2,
  Calculator,
  CheckCircle2,
  GitBranch,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";

const features = [
  { icon: Search, title: "Smart Loan Comparison", desc: "Compare SME schemes across top Sri Lankan banks in one view." },
  { icon: Calculator, title: "Live EMI Forecast", desc: "Instantly model monthly obligations, principal split, and cost bands." },
  { icon: ShieldCheck, title: "Approval Probability", desc: "See match confidence before submitting documents." },
  { icon: Upload, title: "Document Verification", desc: "Manage required files with checklist-driven verification status." },
  { icon: GitBranch, title: "Application Tracking", desc: "Follow every stage from draft to final bank decision." },
];

const highlights = [
  { label: "Banks Connected", value: "7+" },
  { label: "Average Review Time", value: "3-7 days" },
  { label: "Active SME Profiles", value: "2,400+" },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-16 items-center justify-between gap-2">
          <Link to="/" className="group flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted text-foreground transition-colors duration-200 group-hover:bg-muted/70">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground sm:text-base">SME Loan Hub</p>
              <p className="hidden text-[11px] font-medium text-muted-foreground sm:block">Intelligent Lending</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#how-it-works" className="transition-colors hover:text-foreground">How it works</a>
            <Link to="/calculator" className="transition-colors hover:text-foreground">EMI Calculator</Link>
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="hidden hover:bg-muted sm:inline-flex">
              <Link to="/login">Log In</Link>
            </Button>
            <Button size="sm" asChild className="px-3 sm:px-4">
              <Link to="/signup">Sign Up</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="pt-16">
        <section className="border-b border-border/70 bg-muted/35">
          <div className="container py-14 sm:py-20">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center">
              <div className="max-w-3xl">
                <p className="inline-flex items-center rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Built for Sri Lankan SMEs
                </p>
                <h1 className="mt-5 text-3xl font-bold leading-tight text-foreground sm:text-4xl lg:text-5xl">
                  Find the right SME loan with a clear, guided process
                </h1>
                <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
                  Compare lender options, estimate EMI, and manage your full application lifecycle in one clean dashboard.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Button size="lg" asChild>
                    <Link to="/apply">
                      Start Loan Check
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link to="/results">Explore Recommendations</Link>
                  </Button>
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <p className="text-sm font-semibold text-foreground">Platform Snapshot</p>
                <div className="mt-4 space-y-3">
                  {highlights.map((stat) => (
                    <div key={stat.label} className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/35 px-4 py-3">
                      <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                      <p className="text-sm font-semibold text-foreground">{stat.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <ProcessBeamSection />

        <section id="features" className="py-16 sm:py-20">
          <div className="container space-y-10">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-bold text-foreground sm:text-4xl">Everything needed for the SME lending journey</h2>
              <p className="mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
                One platform for discovery, eligibility guidance, document readiness, and follow-through.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {features.map((feature, idx) => (
                <Card key={feature.title} className="blur-fade-in surface-card border-border/80" style={{ animationDelay: `${idx * 50}ms` }}>
                  <CardContent className="space-y-4 p-6">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-muted/45 text-foreground">
                      <feature.icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{feature.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="container">
            <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Trusted by leading banks</p>
              <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                {["Bank of Ceylon", "People's Bank", "Commercial Bank", "HNB", "Sampath Bank", "Seylan Bank", "NDB"].map((bank) => (
                  <div key={bank} className="rounded-lg border border-border bg-muted/35 px-4 py-3 text-center font-medium text-foreground">
                    {bank}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="pb-16">
          <div className="container">
            <div className="rounded-2xl border border-border bg-card p-8 text-center sm:p-10">
              <h3 className="text-2xl font-bold text-foreground sm:text-3xl">Ready to find your ideal loan?</h3>
              <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground">
                Start your application and receive personalized lender recommendations in minutes.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Button asChild>
                  <Link to="/apply">Start Application</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/dashboard">Open Dashboard</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70 bg-muted/20 py-10">
        <div className="container flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
              <Building2 className="h-4 w-4" />
            </div>
            <span className="font-semibold text-foreground">SME Loan Hub</span>
          </Link>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" />Secure processing</span>
            <span>Support: info@smeloanhub.lk</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
