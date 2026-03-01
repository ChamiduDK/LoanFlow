import { ReactNode, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

const SECTION_HINTS: Array<{ prefix: string; label: string; hint: string }> = [
  { prefix: "/dashboard", label: "Overview", hint: "Start here for your latest loan progress." },
  { prefix: "/apply", label: "Application", hint: "Complete each step to keep your profile accurate." },
  { prefix: "/results", label: "Recommendations", hint: "Compare lenders, then track the best option." },
  { prefix: "/calculator", label: "EMI Planning", hint: "Test different rates and tenures before applying." },
  { prefix: "/documents", label: "Documents", hint: "Upload required files to avoid review delays." },
  { prefix: "/tracker", label: "Tracker", hint: "Follow approval progress and final bank checks." },
  { prefix: "/management", label: "Repayments", hint: "Monitor installments once a loan is approved." },
  { prefix: "/admin", label: "Admin", hint: "Manage banks, rules, and user operations." },
];

export default function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  const location = useLocation();
  const sectionHint = useMemo(
    () => SECTION_HINTS.find((item) => location.pathname.startsWith(item.prefix)),
    [location.pathname],
  );

  return (
    <header className={cn("page-header", className)}>
      <div className="space-y-1.5">
        {sectionHint ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{sectionHint.label}</span>
            <span className="hidden sm:inline">| {sectionHint.hint}</span>
          </div>
        ) : null}
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
