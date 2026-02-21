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
import { apiFetch } from "@/lib/api/client";
import type { LoanApplication } from "@/types/backend";
import { formatLKR } from "@/lib/currency";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-LK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function Dashboard() {
  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["applications"],
    queryFn: () => apiFetch<LoanApplication[]>("/api/applications"),
  });

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
    { title: "New Loan Application", desc: "Start a guided multi-step form", icon: Plus, path: "/apply" },
    { title: "Upload Documents", desc: "Complete verification checklist", icon: Upload, path: "/documents" },
    { title: "Track Applications", desc: "See status and bank timelines", icon: GitBranch, path: "/tracker" },
    { title: "Run EMI Calculator", desc: "Estimate monthly repayment", icon: TrendingUp, path: "/calculator" },
  ];

  return (
    <div className="space-y-6 px-2 md:px-6">
      <PageHeader
        title="Dashboard"
        subtitle="Live view of your SME loan pipeline and recommendation readiness."
        actions={(
          <Button asChild>
            <Link to="/apply">
              <Plus className="h-4 w-4" />
              New Application
            </Link>
          </Button>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item, idx) => (
          <Card key={item.label} className="border-border/50 bg-gradient-to-br from-card to-card/50 hover:shadow-lg" style={{ animationDelay: `${idx * 50}ms` }}>
            <CardContent className="p-5">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg transition-transform duration-300 hover:scale-110 ${item.surfaceClass}`}>
                      <item.icon className={`h-5 w-5 ${item.iconClass}`} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">{item.value}</p>
                  <p className="text-xs font-medium text-muted-foreground">{item.trend}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="gradient-text">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {quickActions.map((action, idx) => (
              <Link
                key={action.title}
                to={action.path}
                className="group rounded-lg border border-border/50 bg-gradient-to-br from-muted/50 to-muted/30 p-4 transition-all duration-300 hover:border-primary/50 hover:bg-gradient-to-br hover:from-primary/10 hover:to-blue-500/10 hover:shadow-md"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{action.title}</p>
                    <p className="text-xs text-muted-foreground">{action.desc}</p>
                  </div>
                  <action.icon className="h-4 w-4 text-muted-foreground transition-all duration-300 group-hover:scale-110 group-hover:text-primary" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle className="gradient-text">Reminder Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reminders.map((reminder, idx) => (
              <div key={reminder.title} className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-gradient-to-br from-card/50 to-muted/20 p-4 transition-all duration-300 hover:shadow-md" style={{ animationDelay: `${idx * 50}ms` }}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 rounded-lg p-2 transition-transform duration-300 hover:scale-110 ${reminder.tone}`}>
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
      </div>

      <Card className="data-table-wrap">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/50 pb-4">
          <div>
            <CardTitle className="gradient-text">Recent Applications</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Track status and submission updates for your applications.</p>
          </div>
          <Button variant="outline" size="sm" asChild className="hover:bg-primary/10">
            <Link to="/tracker">
              Open Tracker
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {applications.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No applications"
                description="Create your first application to start eligibility evaluation and recommendations."
                action={(
                  <Button asChild>
                    <Link to="/apply">Create Application</Link>
                  </Button>
                )}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/50 hover:bg-transparent">
                  <TableHead className="font-semibold text-foreground">Application ID</TableHead>
                  <TableHead className="font-semibold text-foreground">Requested Amount</TableHead>
                  <TableHead className="font-semibold text-foreground">Purpose</TableHead>
                  <TableHead className="font-semibold text-foreground">Status</TableHead>
                  <TableHead className="font-semibold text-foreground">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((app) => (
                  <TableRow key={app.id} className="border-b border-border/50 transition-colors hover:bg-muted/50">
                    <TableCell className="font-mono text-xs font-medium text-foreground">{app.id.slice(0, 8)}</TableCell>
                    <TableCell className="font-medium text-foreground">{formatLKR(app.requested_amount)}</TableCell>
                    <TableCell className="font-medium text-foreground">{app.purpose}</TableCell>
                    <TableCell>
                      <StatusBadge status={app.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(app.updated_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
