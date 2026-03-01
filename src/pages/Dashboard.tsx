import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Bell,
  Building2,
  Clock3,
  FileText,
  GitBranch,
  Plus,
  TrendingUp,
  Upload,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import LoanFlowChatPanel from "@/components/dashboard/LoanFlowChatPanel";
import { apiFetch } from "@/lib/api/client";
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

export default function Dashboard() {
  const applicationsQuery = useQuery({
    queryKey: ["applications"],
    queryFn: () => apiFetch<LoanApplication[]>("/api/applications"),
  });
  const applications = applicationsQuery.data ?? EMPTY_APPLICATIONS;
  const isLoading = applicationsQuery.isLoading;

  const summary = useMemo(() => {
    const active = applications.filter((item) => !["approved", "rejected", "withdrawn"].includes(item.status)).length;
    const evaluated = applications.filter((item) => item.status === "evaluated").length;
    const approved = applications.filter((item) => item.status === "approved").length;
    const decisionPool = applications.filter((item) => ["approved", "rejected"].includes(item.status)).length;
    const approvalRate = decisionPool > 0 ? Math.round((approved / decisionPool) * 100) : 0;

    return [
      {
        label: "Active Applications",
        value: String(active),
        trend: `${applications.length} total submitted`,
        icon: FileText,
        iconClass: "text-primary",
        surfaceClass: "bg-primary/10",
      },
      {
        label: "Evaluated Profiles",
        value: String(evaluated),
        trend: "Ready for recommendations",
        icon: Building2,
        iconClass: "text-success",
        surfaceClass: "bg-success/10",
      },
      {
        label: "In Review",
        value: String(applications.filter((item) => item.status === "under_review").length),
        trend: "Awaiting lender decisions",
        icon: Upload,
        iconClass: "text-warning",
        surfaceClass: "bg-warning/15",
      },
      {
        label: "Approval Rate",
        value: `${approvalRate}%`,
        trend: "Based on final outcomes",
        icon: TrendingUp,
        iconClass: "text-info",
        surfaceClass: "bg-info/10",
      },
    ];
  }, [applications]);

  const reminders = useMemo(() => {
    if (applications.length === 0) {
      return [
        {
          title: "No applications yet",
          detail: "Create your first loan application to start eligibility evaluation.",
          icon: Bell,
          tone: "bg-info/10 text-info",
          tag: "Info",
        },
      ];
    }

    const latest = applications[0];

    return [
      {
        title: "Latest application status",
        detail: `Application ${latest.id.slice(0, 8)} is currently ${latest.status.replace(/_/g, " ")}.`,
        icon: Clock3,
        tone: "bg-warning/15 text-warning",
        tag: latest.status,
      },
      {
        title: "Need recommendations?",
        detail: "Run evaluation from results page after completing your application profile.",
        icon: TrendingUp,
        tone: "bg-primary/10 text-primary",
        tag: "Action",
      },
    ];
  }, [applications]);

  const quickActions = [
    { title: "New Loan Application", desc: "Start the guided form", icon: Plus, path: "/apply" },
    { title: "Upload Documents", desc: "Complete the required checklist", icon: Upload, path: "/documents" },
    { title: "Track Applications", desc: "Check bank review progress", icon: GitBranch, path: "/tracker" },
    { title: "Run EMI Calculator", desc: "Estimate your monthly payment", icon: TrendingUp, path: "/calculator" },
  ];
  const recentApplications = useMemo(() => applications.slice(0, 3), [applications]);

  return (
    <div className="flex flex-col gap-4 px-1 md:px-2">
      <PageHeader
        title="Dashboard"
        subtitle="LoanFlow 1.0 chat is your main workspace for scheme guidance and next actions."
        className="top-0 z-0 border-none bg-transparent pb-0 pt-0 backdrop-blur-none"
        actions={(
          <Button asChild>
            <Link to="/apply">
              <Plus className="h-4 w-4" />
              New Application
            </Link>
          </Button>
        )}
      />

      <LoanFlowChatPanel />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item, idx) => (
          <Card
            key={item.label}
            className="border-border/70 bg-card shadow-sm transition-shadow hover:shadow-md"
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            <CardContent className="p-4">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{item.label}</p>
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 ${item.surfaceClass}`}>
                      <item.icon className={`h-4 w-4 ${item.iconClass}`} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold leading-none text-foreground">{item.value}</p>
                  <p className="text-xs font-medium text-muted-foreground">{item.trend}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {applicationsQuery.isError ? (
        <Card className="border-warning/40 bg-warning/10 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-warning-foreground">
              Could not load latest applications data.
            </p>
            <Button size="sm" variant="outline" onClick={() => void applicationsQuery.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-12">
        <Card className="border-border/70 bg-card shadow-sm lg:col-span-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {quickActions.map((action, idx) => (
              <Link
                key={action.title}
                to={action.path}
                className="group rounded-lg border border-border/70 bg-muted/30 p-3 transition-colors hover:border-primary/40 hover:bg-muted/45"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{action.title}</p>
                    <p className="text-xs text-muted-foreground">{action.desc}</p>
                  </div>
                  <action.icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card shadow-sm lg:col-span-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Reminder Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {reminders.map((reminder, idx) => (
              <div
                key={reminder.title}
                className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-muted/25 p-3 transition-shadow hover:shadow-sm"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 rounded-lg border border-border/70 p-2 ${reminder.tone}`}>
                    <reminder.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{reminder.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{reminder.detail}</p>
                  </div>
                </div>
                <StatusBadge status={reminder.tag} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card shadow-sm lg:col-span-4">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <CardTitle className="text-lg">Recent Applications</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link to="/tracker">
                Open Tracker
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {applications.length === 0 ? (
              <EmptyState
                title="No applications"
                description="Create your first application to start eligibility evaluation and recommendations."
                action={(
                  <Button asChild>
                    <Link to="/apply">Create Application</Link>
                  </Button>
                )}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/50 hover:bg-transparent">
                    <TableHead className="font-semibold text-foreground">ID</TableHead>
                    <TableHead className="font-semibold text-foreground">Amount</TableHead>
                    <TableHead className="font-semibold text-foreground">Status</TableHead>
                    <TableHead className="font-semibold text-foreground">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentApplications.map((app) => (
                    <TableRow key={app.id} className="border-b border-border/50 transition-colors hover:bg-muted/50">
                      <TableCell className="font-mono text-xs font-medium text-foreground">{app.id.slice(0, 8)}</TableCell>
                      <TableCell className="font-medium text-foreground">{formatLKR(app.requested_amount)}</TableCell>
                      <TableCell>
                        <StatusBadge status={app.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(app.updated_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {applications.length > recentApplications.length ? (
              <p className="text-xs text-muted-foreground">
                Showing latest {recentApplications.length} of {applications.length} applications.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
