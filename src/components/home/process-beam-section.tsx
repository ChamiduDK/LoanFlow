"use client";

import { forwardRef, useRef, type ReactNode } from "react";
import {
  Building2,
  CalendarCheck,
  Calculator,
  HandCoins,
  Landmark,
  MessageCircle,
  ShieldCheck,
  TrendingUp,
  Upload,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { AnimatedBeam } from "@/registry/magicui/animated-beam";

type CircleProps = {
  className?: string;
  children?: ReactNode;
  label: string;
  tooltip?: string;
  labelClassName?: string;
};

const Circle = forwardRef<HTMLDivElement, CircleProps>(
  ({ className, children, label, tooltip, labelClassName }, ref) => {
    return (
      <div className="group flex flex-col items-center gap-2 text-center">
        <div
          ref={ref}
          title={tooltip ?? label}
          className={cn(
            "border-border relative z-10 flex size-14 items-center justify-center rounded-full border bg-background text-foreground shadow-[0_14px_30px_-20px_hsl(var(--foreground)/0.35)] transition-all duration-300",
            "group-hover:-translate-y-0.5 group-hover:shadow-[0_18px_34px_-22px_hsl(var(--foreground)/0.35)]",
            className,
          )}
        >
          {children}
        </div>
        <p className={cn("max-w-[100px] text-[11px] font-medium leading-tight text-muted-foreground sm:text-xs", labelClassName)}>
          {label}
        </p>
      </div>
    );
  },
);

Circle.displayName = "Circle";

function NodeChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xs font-medium text-foreground">{label}</span>
    </div>
  );
}

export default function ProcessBeamSection() {
  const containerRef = useRef<HTMLDivElement>(null);

  const smeProfileRef = useRef<HTMLDivElement>(null);
  const loanRequestRef = useRef<HTMLDivElement>(null);
  const documentsRef = useRef<HTMLDivElement>(null);
  const whatsappRef = useRef<HTMLDivElement>(null);

  const platformRef = useRef<HTMLDivElement>(null);

  const bankMatchRef = useRef<HTMLDivElement>(null);
  const emiRef = useRef<HTMLDivElement>(null);
  const approvalRef = useRef<HTMLDivElement>(null);
  const docCheckRef = useRef<HTMLDivElement>(null);
  const trackerRef = useRef<HTMLDivElement>(null);

  return (
    <section id="how-it-works" className="py-16 sm:py-20">
      <div className="container px-2 sm:px-4 xl:px-0">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card/95 p-5 shadow-sm sm:p-8 lg:p-12">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,hsl(var(--info)/0.12),transparent_40%)]" />

          <div className="relative z-10 mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">How the Platform Works</h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              The system analyzes eligibility, EMI affordability, document readiness, and AI-assisted support to recommend the best-fit SME loan path.
            </p>
          </div>

          <div
            className="relative mt-12 hidden h-[580px] w-full items-center justify-center overflow-hidden xl:flex"
            ref={containerRef}
          >
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl" />

            <div className="flex size-full max-w-5xl flex-row items-stretch justify-between gap-6 lg:gap-10">
              <div className="flex flex-col justify-center gap-5">
                <Circle
                  ref={smeProfileRef}
                  label="SME Profile"
                  tooltip="Business profile and operating details"
                >
                  <Building2 className="h-5 w-5" />
                </Circle>
                <Circle
                  ref={loanRequestRef}
                  label="Loan Request"
                  tooltip="Amount, tenure, and purpose"
                >
                  <HandCoins className="h-5 w-5" />
                </Circle>
                <Circle
                  ref={documentsRef}
                  label="Documents"
                  tooltip="Uploaded business and financial documents"
                >
                  <Upload className="h-5 w-5" />
                </Circle>
                <Circle
                  ref={whatsappRef}
                  label="WhatsApp AI"
                  tooltip="Questions and support requests from user"
                >
                  <MessageCircle className="h-5 w-5" />
                </Circle>
              </div>

              <div className="flex flex-col justify-center">
                <Circle
                  ref={platformRef}
                  label="Loan Intelligence Platform"
                  tooltip="Central eligibility and recommendation engine"
                  className="size-44 overflow-visible rounded-3xl border-primary/35 bg-background shadow-[0_28px_45px_-30px_hsl(var(--primary)/0.55)] ring-8 ring-primary/10"
                  labelClassName="max-w-[180px] text-xs font-semibold text-foreground"
                >
                  <div className="flex h-full w-full items-center justify-center px-4 text-center">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Core Engine
                      </p>
                      <p className="mt-1 text-sm font-semibold text-foreground">Loan Intelligence</p>
                    </div>
                  </div>
                </Circle>
              </div>

              <div className="flex flex-col justify-center gap-4">
                <Circle
                  ref={bankMatchRef}
                  label="Bank Match"
                  tooltip="Best-fit bank schemes and ranking"
                >
                  <Landmark className="h-5 w-5" />
                </Circle>
                <Circle
                  ref={emiRef}
                  label="EMI Calculator"
                  tooltip="Installment and total cost simulation"
                >
                  <Calculator className="h-5 w-5" />
                </Circle>
                <Circle
                  ref={approvalRef}
                  label="Approval Score"
                  tooltip="Estimated approval confidence"
                >
                  <TrendingUp className="h-5 w-5" />
                </Circle>
                <Circle
                  ref={docCheckRef}
                  label="Doc Check"
                  tooltip="Checklist and document verification"
                >
                  <ShieldCheck className="h-5 w-5" />
                </Circle>
                <Circle
                  ref={trackerRef}
                  label="Loan Tracker"
                  tooltip="Application status and milestone tracking"
                >
                  <CalendarCheck className="h-5 w-5" />
                </Circle>
              </div>
            </div>

            <AnimatedBeam containerRef={containerRef} fromRef={smeProfileRef} toRef={platformRef} curvature={-70} delay={0.1} />
            <AnimatedBeam containerRef={containerRef} fromRef={loanRequestRef} toRef={platformRef} curvature={-24} delay={0.18} />
            <AnimatedBeam containerRef={containerRef} fromRef={documentsRef} toRef={platformRef} curvature={26} delay={0.26} />
            <AnimatedBeam containerRef={containerRef} fromRef={whatsappRef} toRef={platformRef} curvature={74} delay={0.34} />

            <AnimatedBeam containerRef={containerRef} fromRef={platformRef} toRef={bankMatchRef} curvature={-90} delay={0.15} reverse />
            <AnimatedBeam containerRef={containerRef} fromRef={platformRef} toRef={emiRef} curvature={-48} delay={0.22} reverse />
            <AnimatedBeam containerRef={containerRef} fromRef={platformRef} toRef={approvalRef} curvature={0} delay={0.3} reverse />
            <AnimatedBeam containerRef={containerRef} fromRef={platformRef} toRef={docCheckRef} curvature={44} delay={0.38} reverse />
            <AnimatedBeam containerRef={containerRef} fromRef={platformRef} toRef={trackerRef} curvature={88} delay={0.46} reverse />
          </div>

          <div className="relative z-10 mt-10 space-y-6 xl:hidden">
            <div className="rounded-xl border border-border bg-muted/30 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground/80">Input Signals</p>
              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <NodeChip icon={<Building2 className="h-4 w-4" />} label="SME Profile" />
                <NodeChip icon={<HandCoins className="h-4 w-4" />} label="Loan Request" />
                <NodeChip icon={<Upload className="h-4 w-4" />} label="Documents" />
                <NodeChip icon={<MessageCircle className="h-4 w-4" />} label="WhatsApp AI" />
              </div>
            </div>

            <div className="flex justify-center">
              <Circle
                label="Loan Intelligence Platform"
                className="size-24 border-primary/35 bg-background ring-8 ring-primary/10"
                labelClassName="max-w-[170px] text-xs font-semibold text-foreground"
              >
                <div className="px-2 text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Core Engine
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-foreground">Loan Intelligence</p>
                </div>
              </Circle>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground/80">Output Services</p>
              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <NodeChip icon={<Landmark className="h-4 w-4" />} label="Bank Match" />
                <NodeChip icon={<Calculator className="h-4 w-4" />} label="EMI Calculator" />
                <NodeChip icon={<TrendingUp className="h-4 w-4" />} label="Approval Score" />
                <NodeChip icon={<ShieldCheck className="h-4 w-4" />} label="Doc Check" />
                <div className="sm:col-span-2">
                  <NodeChip icon={<CalendarCheck className="h-4 w-4" />} label="Loan Tracker" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
