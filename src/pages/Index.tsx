import { Link } from "react-router-dom";
import {
  BellIcon,
  CalendarIcon,
  FileTextIcon,
  GlobeIcon,
  InputIcon,
} from "@radix-ui/react-icons";
import {
  ArrowRight,
  Calculator,
  FileCheck2,
  GitBranch,
  Github,
  Instagram,
  Landmark,
  Linkedin,
  Mail,
  Phone,
  Twitter,
  Youtube,
} from "lucide-react";

import { HeroSection } from "@/components/ui/hero-section-1";
import { Button } from "@/components/ui/button";
import ProcessBeamSection from "@/components/home/process-beam-section";
import EMICalculatorSection from "@/components/home/EMICalculatorSection";
import { BentoCard, BentoGrid } from "@/registry/magicui/bento-grid";

const features = [
  {
    Icon: FileTextIcon,
    name: "Document Readiness",
    description: "Detect missing files early and improve submission quality before bank review.",
    href: "/documents",
    cta: "Learn more",
    background: (
      <img
        src="https://images.unsplash.com/photo-1450101499163-c8848c66ca85?q=70&w=640&auto=format&fit=crop"
        alt="Document review"
        loading="lazy"
        decoding="async"
        className="absolute -right-16 -top-16 h-52 w-52 rounded-2xl object-cover opacity-55"
      />
    ),
    className: "lg:col-start-2 lg:col-end-3 lg:row-start-1 lg:row-end-4",
  },
  {
    Icon: InputIcon,
    name: "Smart Search",
    description: "Search and compare relevant loan schemes, requirements, and conditions in one place.",
    href: "/results",
    cta: "Learn more",
    background: (
      <img
        src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=70&w=640&auto=format&fit=crop"
        alt="Loan search"
        loading="lazy"
        decoding="async"
        className="absolute -right-16 -top-16 h-52 w-52 rounded-2xl object-cover opacity-55"
      />
    ),
    className: "lg:col-start-1 lg:col-end-2 lg:row-start-1 lg:row-end-3",
  },
  {
    Icon: GlobeIcon,
    name: "Guided Workflow",
    description: "Follow a structured, user-friendly path from profile setup to final submission.",
    href: "/apply",
    cta: "Learn more",
    background: (
      <img
        src="https://images.unsplash.com/photo-1552664730-d307ca884978?q=70&w=640&auto=format&fit=crop"
        alt="Guided workflow"
        loading="lazy"
        decoding="async"
        className="absolute -right-16 -top-16 h-52 w-52 rounded-2xl object-cover opacity-55"
      />
    ),
    className: "lg:col-start-1 lg:col-end-2 lg:row-start-3 lg:row-end-4",
  },
  {
    Icon: CalendarIcon,
    name: "Planning Timeline",
    description: "Plan application preparation with clearer milestones and timing visibility.",
    href: "/apply",
    cta: "Learn more",
    background: (
      <img
        src="https://images.unsplash.com/photo-1506784365847-bbad939e9335?q=70&w=640&auto=format&fit=crop"
        alt="Planning timeline"
        loading="lazy"
        decoding="async"
        className="absolute -right-16 -top-16 h-52 w-52 rounded-2xl object-cover opacity-55"
      />
    ),
    className: "lg:col-start-3 lg:col-end-4 lg:row-start-1 lg:row-end-2",
  },
  {
    Icon: BellIcon,
    name: "Progress Alerts",
    description: "Stay updated when requirements change or action is needed in your loan journey.",
    href: "/documents",
    cta: "Learn more",
    background: (
      <img
        src="https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?q=70&w=640&auto=format&fit=crop"
        alt="Progress alerts"
        loading="lazy"
        decoding="async"
        className="absolute -right-16 -top-16 h-52 w-52 rounded-2xl object-cover opacity-55"
      />
    ),
    className: "lg:col-start-3 lg:col-end-4 lg:row-start-2 lg:row-end-4",
  },
];

const onboardingBenefits = [
  {
    icon: Landmark,
    label: "Compare suitable bank products in one place",
    iconClassName: "text-info",
  },
  {
    icon: Calculator,
    label: "Estimate EMI and total repayment before applying",
    iconClassName: "text-primary",
  },
  {
    icon: FileCheck2,
    label: "Check document readiness early to avoid delays",
    iconClassName: "text-success",
  },
  {
    icon: GitBranch,
    label: "Track your application progress after submission",
    iconClassName: "text-warning-foreground",
  },
];

const focusAreas = [
  { label: "Target Users", value: "Sri Lankan SME Owners" },
  { label: "Platform", value: "Web-based Decision Support" },
  { label: "Predictive Layer", value: "ML/DL Approval Estimation" },
  { label: "Coverage", value: "Retail, Services, Manufacturing, Agriculture" },
];

const footerLinks = {
  product: [
    { label: "Loan Results", to: "/results" },
    { label: "EMI Calculator", to: "/calculator" },
    { label: "Loan Application", to: "/apply" },
  ],
  resources: [
    { label: "Create Account", to: "/signup" },
    { label: "Sign In", to: "/login" },
    { label: "Document Center", to: "/documents" },
    { label: "Application Tracker", to: "/tracker" },
  ],
  company: [
    { label: "About", to: "/" },
    { label: "Vision", to: "/" },
    { label: "Privacy Policy", to: "/" },
    { label: "Contact Us", to: "/" },
  ],
};

const socialLinks = [
  { label: "Twitter", href: "https://x.com", Icon: Twitter },
  { label: "GitHub", href: "https://github.com", Icon: Github },
  { label: "LinkedIn", href: "https://linkedin.com", Icon: Linkedin },
  { label: "YouTube", href: "https://youtube.com", Icon: Youtube },
  { label: "Instagram", href: "https://instagram.com", Icon: Instagram },
];

export default function Index() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      <HeroSection />

      <main className="px-3 sm:px-4 md:px-6">
        <section className="border-y border-border/70 bg-muted/35">
          <div className="container px-2 py-12 sm:py-14 md:px-0 lg:py-16">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <div className="max-w-3xl">
                <p className="inline-flex items-center rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Built for Sri Lankan SMEs
                </p>
                <h2 className="mt-5 text-balance text-3xl font-bold leading-tight sm:text-4xl lg:text-[2.9rem]">
                  Clearer Loan Decisions, Faster Action
                </h2>
                <p className="mt-4 text-pretty text-base text-muted-foreground sm:text-lg">
                  LoanFlow gives business owners one practical workspace to compare lenders,
                  estimate repayments, and prepare stronger submissions with fewer surprises.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {onboardingBenefits.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-start gap-3 rounded-xl border border-border/80 bg-card px-4 py-3 transition hover:bg-muted/30"
                    >
                      <item.icon className={`mt-0.5 h-4 w-4 ${item.iconClassName}`} />
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <Button size="lg" asChild className="w-full sm:w-auto">
                    <Link to="/signup">
                      Get Started
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
                    <Link to="/results">View Loan Matches</Link>
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-border/85 bg-card/95 p-5 shadow-sm">
                <p className="text-sm font-semibold text-foreground">Platform Snapshot</p>
                <div className="mt-4 space-y-3">
                  {focusAreas.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg border border-border/80 bg-background/80 px-4 py-3"
                    >
                      <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <ProcessBeamSection />

        <section id="features" className="py-16 sm:py-20">
          <div className="container space-y-8 px-2 sm:space-y-10 md:px-0">
            <div className="max-w-4xl">
              <h2 className="text-2xl font-bold sm:text-3xl lg:text-4xl">Why This Platform Matters</h2>
              <p className="mt-3 text-pretty text-base text-muted-foreground sm:text-lg">
                SME financing can be complex. LoanFlow is designed to reduce confusion, shorten
                decision time, and improve application quality.
              </p>
            </div>

            <BentoGrid className="lg:grid-rows-3">
              {features.map((feature) => (
                <BentoCard key={feature.name} {...feature} />
              ))}
            </BentoGrid>
          </div>
        </section>

        <EMICalculatorSection />

        <section className="pb-16 pt-14 sm:pt-16">
          <div className="container px-2 md:px-0">
            <div className="rounded-2xl border border-border/80 bg-gradient-to-r from-primary to-foreground px-6 py-10 text-center text-primary-foreground shadow-lg sm:px-10 sm:py-12">
              <h3 className="text-xl font-semibold sm:text-2xl md:text-3xl">
                Ready to Start Your Loan Plan?
              </h3>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-primary-foreground/90 sm:text-base">
                Create your account to compare options, run calculations, and prepare a stronger
                SME loan application.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="w-full bg-background text-foreground hover:bg-background/90 sm:w-auto">
                  <Link to="/signup">Create Account</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="w-full border-primary-foreground/60 bg-transparent text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground sm:w-auto"
                >
                  <Link to="/login">Login</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <div className="bg-black px-4 pt-20 text-white">
        <footer className="mx-auto w-full max-w-[1350px] overflow-hidden rounded-tl-3xl rounded-tr-3xl bg-[#131314] px-4 pt-8 sm:px-8 md:px-16 lg:px-28 lg:pt-12">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 md:gap-12 lg:grid-cols-6">
            <div className="space-y-6 lg:col-span-3">
              <Link to="/" className="block text-2xl font-semibold tracking-tight text-white">
                LoanFlow
              </Link>
              <p className="max-w-96 text-sm/6 text-neutral-300">
                LoanFlow helps Sri Lankan SMEs compare lenders, calculate EMI, prepare required
                documents, and track applications with greater confidence.
              </p>
              <div className="space-y-2 text-sm text-neutral-300">
                <a
                  href="mailto:info@loanflow.lk"
                  className="inline-flex items-center gap-2 transition hover:text-white"
                >
                  <Mail className="h-4 w-4" />
                  info@loanflow.lk
                </a>
                <a
                  href="tel:+94112345678"
                  className="inline-flex items-center gap-2 transition hover:text-white"
                >
                  <Phone className="h-4 w-4" />
                  +94 11 234 5678
                </a>
              </div>
              <div className="flex gap-5 md:gap-6">
                {socialLinks.map(({ label, href, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className="text-white transition hover:text-neutral-300"
                  >
                    <Icon className="h-5 w-5" />
                  </a>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 items-start gap-8 md:grid-cols-3 md:gap-12 lg:col-span-3 lg:gap-28">
              <div>
                <h3 className="mb-4 text-sm font-medium text-white">Product</h3>
                <ul className="space-y-3 text-sm text-neutral-300">
                  {footerLinks.product.map((item) => (
                    <li key={item.label}>
                      <Link to={item.to} className="transition hover:text-neutral-400">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="mb-4 text-sm font-medium text-white">Resources</h3>
                <ul className="space-y-3 text-sm text-neutral-300">
                  {footerLinks.resources.map((item) => (
                    <li key={item.label}>
                      <Link to={item.to} className="transition hover:text-neutral-400">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="col-span-2 md:col-span-1">
                <h3 className="mb-4 text-sm font-medium text-white">Company</h3>
                <ul className="space-y-3 text-sm text-neutral-300">
                  {footerLinks.company.map((item) => (
                    <li key={item.label}>
                      <Link to={item.to} className="transition hover:text-neutral-400">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="mx-auto mt-12 flex max-w-7xl items-center justify-between border-t border-neutral-700 pt-4">
            <p className="text-sm text-neutral-400">© 2026 LoanFlow</p>
            <p className="text-sm text-neutral-400">All rights reserved.</p>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto h-full max-h-64 w-full max-w-3xl rounded-full bg-[hsl(var(--info)/0.55)] blur-[170px]" />
            <h2 className="mt-6 text-center text-[clamp(3rem,15vw,15rem)] font-extrabold leading-[0.7] text-transparent [-webkit-text-stroke:1px_hsl(var(--info))]">
              LoanFlow
            </h2>
          </div>
        </footer>
      </div>
    </div>
  );
}

