import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import heroBg from "@/assets/hero-bg.jpg";

const features = [
  { icon: Search, title: "Smart Loan Comparison", desc: "Compare SME schemes across top Sri Lankan banks in one view." },
  { icon: Calculator, title: "Live EMI Forecast", desc: "Instantly model monthly obligations, principal split, and cost bands." },
  { icon: ShieldCheck, title: "Approval Probability", desc: "See match confidence before submitting documents." },
  { icon: Upload, title: "Document Verification", desc: "Manage required files with checklist-driven verification status." },
  { icon: GitBranch, title: "Application Tracking", desc: "Follow every stage from draft to final bank decision." },
];

const steps = [
  { step: "01", title: "Submit Business Profile", desc: "Enter company basics, loan amount, and repayment preference." },
  { step: "02", title: "Review Ranked Options", desc: "See lender fit, approval probability, and EMI ranges." },
  { step: "03", title: "Upload Verification Docs", desc: "Share required files and resolve missing items quickly." },
  { step: "04", title: "Track and Manage", desc: "Monitor approval flow and manage repayments in one dashboard." },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-blue-600 text-white shadow-lg group-hover:shadow-xl transition-all duration-300">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">SME Loan Hub</p>
              <p className="text-[11px] text-muted-foreground font-medium">Intelligent Lending</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#how-it-works" className="transition-colors hover:text-foreground">How it works</a>
            <Link to="/calculator" className="transition-colors hover:text-foreground">EMI Calculator</Link>
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="hover:bg-muted">
              <Link to="/login">Log In</Link>
            </Button>
            <Button size="sm" asChild className="bg-primary hover:bg-primary/90">
              <Link to="/signup">Sign Up</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden pt-16">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroBg})` }} />
        <div className="absolute inset-0 bg-slate-950/70" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-transparent to-blue-600/20" />

        <div className="relative container py-20 md:py-32">
          <div className="max-w-4xl">
            <p className="inline-flex items-center rounded-full border border-white/30 bg-white/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-white/95 backdrop-blur-sm">
              ✨ Built for Sri Lankan SMEs
            </p>
            <h1 className="mt-6 text-4xl font-bold leading-tight text-white md:text-5xl lg:text-6xl bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
              Find the Right SME Loan with Confidence
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-white/85 md:text-xl">
              Compare lender options, estimate EMI, and manage the full application lifecycle in one intelligent platform.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button variant="default" size="lg" asChild className="bg-white text-slate-900 hover:bg-white/95 font-semibold shadow-lg">
                <Link to="/apply">
                  Start Loan Check
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
              <Button size="lg" asChild className="bg-white/20 text-white hover:bg-white/30 border border-white/40 font-semibold">
                <Link to="/results">Explore Recommendations</Link>
              </Button>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {[
                { label: "Banks Connected", value: "7+" },
                { label: "Avg. Review Time", value: "3-7 days" },
                { label: "Active SME Profiles", value: "2,400+" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-white/20 bg-white/10 p-5 backdrop-blur-md transition-all duration-300 hover:bg-white/15 hover:border-white/30">
                  <p className="text-xs text-white/70 font-medium">{stat.label}</p>
                  <p className="mt-2 text-2xl font-bold text-white">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-20 bg-gradient-to-b from-background to-muted/20">
        <div className="container space-y-12">
          <div className="max-w-3xl">
            <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Everything needed for the SME lending journey</h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
              A single platform for discovery, eligibility guidance, document readiness, and application follow-through.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {features.map((feature, idx) => (
              <Card key={feature.title} className="blur-fade-in surface-card bg-gradient-to-br from-card/80 to-card/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg border-border/50" style={{ animationDelay: `${idx * 50}ms` }}>
                <CardContent className="space-y-4 p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-primary/30 to-blue-500/20 text-primary transition-all duration-300 hover:scale-110">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="bg-muted/30 py-20">
        <div className="container space-y-12">
          <div className="max-w-3xl">
            <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">How it works</h2>
            <p className="mt-4 text-lg text-muted-foreground">Get from profile setup to lender decision in four structured steps.</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {steps.map((step, idx) => (
              <Card key={step.step} className="blur-fade-in surface-card bg-gradient-to-br from-card/80 to-card/40 border-border/50 transition-all duration-300 hover:shadow-lg" style={{ animationDelay: `${idx * 50}ms` }}>
                <CardContent className="space-y-4 p-6">
                  <div className="inline-flex rounded-lg bg-gradient-to-r from-primary/30 to-blue-500/20 px-3 py-1.5 text-sm font-bold text-primary">{step.step}</div>
                  <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container">
          <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-card/50 to-muted/10 p-8 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">Trusted by leading banks</p>
            <div className="mt-6 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
              {["Bank of Ceylon", "People's Bank", "Commercial Bank", "HNB", "Sampath Bank", "Seylan Bank", "NDB"].map((bank) => (
                <div key={bank} className="rounded-lg border border-border/50 bg-card/50 px-4 py-3 text-center font-medium text-foreground transition-all duration-300 hover:border-primary/50 hover:bg-primary/10">
                  {bank}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container">
          <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-blue-600/10 p-8 text-center">
            <h3 className="text-2xl md:text-3xl font-bold text-foreground">Ready to find your ideal loan?</h3>
            <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
              Start your application and receive personalized lender recommendations in minutes.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild className="bg-primary hover:bg-primary/90 font-semibold">
                <Link to="/apply">Start Application</Link>
              </Button>
              <Button variant="outline" asChild className="border-border/50 hover:bg-muted/50">
                <Link to="/dashboard">Open Dashboard</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/50 bg-muted/20 py-12">
        <div className="container flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-blue-600 text-white group-hover:shadow-lg transition-all duration-300">
              <Building2 className="h-4 w-4" />
            </div>
            <span className="font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">SME Loan Hub</span>
          </Link>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" />Secure processing</span>
            <span>Support: info@smeloanhub.lk</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
