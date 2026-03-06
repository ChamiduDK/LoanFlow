import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Bot,
  Calculator,
  CheckCircle2,
  Clock,
  FileText,
  GitBranch,
  Plus,
  TrendingUp,
  Upload,
  AlertCircle,
  XCircle,
} from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";
import StatusBadge from "@/components/shared/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import type { LoanApplication } from "@/types/backend";
import { formatLKR } from "@/lib/currency";

const EMPTY_APPLICATIONS: LoanApplication[] = [];

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-LK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getStatusIcon(status: string) {
  if (status === "approved") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "rejected") return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === "under_review") return <Clock className="h-4 w-4 text-amber-500" />;
  return <AlertCircle className="h-4 w-4 text-blue-500" />;
}

const quickActions = [
  { title: "AI Chat", desc: "Ask LoanFlow AI anything", icon: Bot, path: "/chat", color: "from-primary/10 to-primary/5 border-primary/20 hover:border-primary/40" },
  { title: "New Application", desc: "Start a new loan request", icon: Plus, path: "/apply", color: "from-blue-500/10 to-blue-600/5 border-blue-500/20 hover:border-blue-500/40" },
  { title: "Upload Documents", desc: "Complete your document checklist", icon: Upload, path: "/documents", color: "from-violet-500/10 to-violet-600/5 border-violet-500/20 hover:border-violet-500/40" },
  { title: "Track Application", desc: "Check bank review progress", icon: GitBranch, path: "/tracker", color: "from-emerald-500/10 to-emerald-600/5 border-emerald-500/20 hover:border-emerald-500/40" },
  { title: "EMI Calculator", desc: "Estimate your repayments", icon: Calculator, path: "/calculator", color: "from-amber-500/10 to-amber-600/5 border-amber-500/20 hover:border-amber-500/40" },
];

export default function Dashboard() {
  const applicationsQuery = useQuery({
    queryKey: ["applications"],
    queryFn: () => apiFetch<LoanApplication[]>("/api/applications"),
  });
  const applications = applicationsQuery.data ?? EMPTY_APPLICATIONS;
  const isLoading = applicationsQuery.isLoading;

  const stats = useMemo(() => {
    const active = applications.filter((a) => !["approved", "rejected", "withdrawn"].includes(a.status)).length;
    const evaluated = applications.filter((a) => a.status === "evaluated").length;
    const underReview = applications.filter((a) => a.status === "under_review").length;
    const approved = applications.filter((a) => a.status === "approved").length;
    const decisionPool = applications.filter((a) => ["approved", "rejected"].includes(a.status)).length;
    const approvalRate = decisionPool > 0 ? Math.round((approved / decisionPool) * 100) : null;

    return [
      { label: "Active Applications", value: active, sub: `${applications.length} total`, icon: FileText, colorClass: "text-blue-500 bg-blue-500/10" },
      { label: "Evaluated Profiles", value: evaluated, sub: "Ready for recommendations", icon: TrendingUp, colorClass: "text-emerald-500 bg-emerald-500/10" },
      { label: "Under Review", value: underReview, sub: "Awaiting lender decisions", icon: Clock, colorClass: "text-amber-500 bg-amber-500/10" },
      { label: "Approval Rate", value: approvalRate !== null ? `${approvalRate}%` : "-", sub: "Based on final outcomes", icon: CheckCircle2, colorClass: "text-violet-500 bg-violet-500/10" },
    ];
  }, [applications]);

  const recentApplications = useMemo(() => applications.slice(0, 5), [applications]);

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Welcome back. Here's your loan journey overview.</p>
        </div>
        <Button asChild>
          <Link to="/apply">
            <Plus className="h-4 w-4" />
            New Application
          </Link>
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        {stats.map((stat, idx) => (
          <Card key={stat.label} className="border-border/70 bg-card shadow-sm" style={{ animationDelay: `${idx * 50}ms` }}>
            <CardContent className="p-4">
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-12" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${stat.colorClass}`}>
                      <stat.icon className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-foreground leading-none">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.sub}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Error banner */}
      {applicationsQuery.isError && !(applicationsQuery.error instanceof ApiRequestError && applicationsQuery.error.status === 403) && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-700 dark:text-red-400 font-medium">Could not load application data.</p>
          <Button size="sm" variant="outline" onClick={() => void applicationsQuery.refetch()}>Retry</Button>
        </div>
      )}

      {/* Quick Actions */}
      <Card className="border-border/70 bg-card shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {quickActions.map((action) => (
            <Link
              key={action.title}
              to={action.path}
              className={`group flex flex-col gap-1.5 rounded-xl border bg-gradient-to-br p-3 transition-all duration-200 ${action.color}`}
            >
              <action.icon className="h-4 w-4 text-foreground/70 group-hover:text-foreground transition-colors" />
              <p className="text-xs font-semibold text-foreground leading-tight">{action.title}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{action.desc}</p>
            </Link>
          ))}
        </CardContent>
      </Card>

      {/* Recent Applications Table */}
      <Card className="border-border/70 bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2 pt-4 px-4">
          <CardTitle className="text-base font-semibold">Recent Applications</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link to="/tracker">
              View All
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : recentApplications.length === 0 ? (
            <EmptyState
              title="No applications yet"
              description="Create your first loan application to get started with eligibility evaluation."
              action={<Button asChild><Link to="/apply">Create Application</Link></Button>}
            />
          ) : (
            <div className="space-y-2">
              {recentApplications.map((app) => (
                <Link
                  key={app.id}
                  to={`/tracker?applicationId=${app.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 hover:bg-muted/40 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(app.status)}
                    <div>
                      <p className="text-sm font-semibold text-foreground font-mono">#{app.id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(app.updated_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-bold text-foreground">{formatLKR(app.requested_amount)}</p>
                      <p className="text-xs text-muted-foreground">{app.preferred_tenure_months}mo tenure</p>
                    </div>
                    <StatusBadge status={app.status} />
                  </div>
                </Link>
              ))}
              {applications.length > recentApplications.length && (
                <p className="text-center text-xs text-muted-foreground pt-1">
                  Showing {recentApplications.length} of {applications.length} applications
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
