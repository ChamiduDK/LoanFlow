import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, Award, Banknote, CheckCircle2, Clock3, Cpu, FileText, GitBranch, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/shared/PageHeader";
import { apiFetch } from "@/lib/api/client";
import type { AdminOverview } from "@/types/admin";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-LK", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminOverview() {
  const overviewQuery = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => apiFetch<AdminOverview>("/api/admin/overview"),
  });

  const metrics = overviewQuery.data?.metrics;

  const cards = useMemo(() => [
    {
      label: "Banks",
      value: metrics?.total_banks ?? 0,
      icon: Banknote,
      tone: "text-primary",
      surface: "bg-primary/10",
      hint: "Active institutions",
    },
    {
      label: "Loan Products",
      value: metrics?.total_products ?? 0,
      icon: GitBranch,
      tone: "text-info",
      surface: "bg-info/10",
      hint: "Configured schemes",
    },
    {
      label: "Applications",
      value: metrics?.total_applications ?? 0,
      icon: FileText,
      tone: "text-warning",
      surface: "bg-warning/15",
      hint: "Across all users",
    },
    {
      label: "Under Review",
      value: metrics?.under_review_applications ?? 0,
      icon: Activity,
      tone: "text-warning",
      surface: "bg-warning/15",
      hint: "Needs follow-up",
    },
    {
      label: "Pending User Approvals",
      value: metrics?.pending_user_approvals ?? 0,
      icon: Clock3,
      tone: "text-warning",
      surface: "bg-warning/15",
      hint: "Awaiting admin approval",
    },
    {
      label: "Approved Outcomes",
      value: metrics?.approved_outcomes ?? 0,
      icon: CheckCircle2,
      tone: "text-success",
      surface: "bg-success/10",
      hint: "Finalized approvals",
    },
    {
      label: "Active ML Model",
      value: metrics?.active_ml_version ? metrics.active_ml_version : "Fallback",
      icon: Cpu,
      tone: "text-primary",
      surface: "bg-primary/10",
      hint: metrics?.active_ml_version ? "Production model" : "Rule fallback",
    },
    {
      label: "ML Accuracy",
      value: metrics?.active_ml_accuracy ? `${(metrics.active_ml_accuracy * 100).toFixed(1)}%` : "N/A",
      icon: Award,
      tone: "text-success",
      surface: "bg-success/10",
      hint: "Latest model accuracy",
    },
  ], [
    metrics?.active_ml_accuracy,
    metrics?.active_ml_version,
    metrics?.approved_outcomes,
    metrics?.pending_user_approvals,
    metrics?.total_applications,
    metrics?.total_banks,
    metrics?.total_products,
    metrics?.under_review_applications,
  ]);

  const quickActions = useMemo(() => ([
    {
      title: "Review User Approvals",
      description: "Approve pending user accounts and assign admin roles.",
      path: "/admin/users",
      badge: metrics?.pending_user_approvals ?? 0,
    },
    {
      title: "Monitor Applications",
      description: "Check incoming applications and current review volume.",
      path: "/admin/applications",
    },
    {
      title: "Update Schemes",
      description: "Adjust bank products and interest ranges.",
      path: "/admin/schemes",
    },
    {
      title: "Inspect Audit Logs",
      description: "Track sensitive actions for compliance.",
      path: "/admin/audit-logs",
    },
  ]), [metrics?.pending_user_approvals]);

  if (overviewQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Admin Overview"
          subtitle="Live operational metrics and latest sensitive actions across the platform."
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Card key={index} className="border-border/70">
              <CardContent className="space-y-3 p-5">
                <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                <div className="h-7 w-20 animate-pulse rounded bg-muted" />
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (overviewQuery.isError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Admin Overview"
          subtitle="Live operational metrics and latest sensitive actions across the platform."
        />
        <Card className="border-border/70 bg-card shadow-sm">
          <CardContent className="space-y-4 p-6">
            <p className="text-sm text-muted-foreground">
              Failed to load admin metrics. Please retry.
            </p>
            <Button onClick={() => void overviewQuery.refetch()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Overview"
        subtitle="Live operational metrics and latest sensitive actions across the platform."
        actions={(
          <Button variant="outline" size="sm" onClick={() => void overviewQuery.refetch()}>
            Refresh
          </Button>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((item) => (
          <Card key={item.label} className="border-border/70 bg-card shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg border border-border/70 ${item.surface}`}>
                  <item.icon className={`h-5 w-5 ${item.tone}`} />
                </div>
              </div>
              <p className="mt-2 truncate text-2xl font-semibold text-foreground">{item.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader className="border-b border-border/50">
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            {quickActions.map((action) => (
              <Link
                key={action.path}
                to={action.path}
                className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">{action.title}</p>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {typeof action.badge === "number" && action.badge > 0 ? (
                    <Badge variant="warning">{action.badge}</Badge>
                  ) : null}
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader className="border-b border-border/50">
            <CardTitle>Recent Audit Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="space-y-3 p-4 md:hidden">
              {(overviewQuery.data?.recent_activity ?? []).map((log) => (
                <div key={log.id} className="rounded-lg border border-border/70 p-3">
                  <p className="text-xs text-muted-foreground">{formatDate(log.created_at)}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{log.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {log.actor_profile?.full_name || log.actor_profile?.email || "System"} | {log.entity_type}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">{log.entity_id ?? "-"}</p>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/50 hover:bg-transparent">
                    <TableHead className="font-semibold text-foreground">Time</TableHead>
                    <TableHead className="font-semibold text-foreground">Actor</TableHead>
                    <TableHead className="font-semibold text-foreground">Action</TableHead>
                    <TableHead className="font-semibold text-foreground">Entity</TableHead>
                    <TableHead className="font-semibold text-foreground">Entity ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(overviewQuery.data?.recent_activity ?? []).map((log) => (
                    <TableRow key={log.id} className="border-b border-border/50 transition-colors hover:bg-muted/40">
                      <TableCell className="text-sm text-muted-foreground">{formatDate(log.created_at)}</TableCell>
                      <TableCell className="font-medium text-foreground">{log.actor_profile?.full_name || log.actor_profile?.email || "System"}</TableCell>
                      <TableCell className="font-medium text-foreground">{log.action}</TableCell>
                      <TableCell className="text-foreground">{log.entity_type}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{log.entity_id ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {(overviewQuery.data?.recent_activity.length ?? 0) === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No audit events available.</div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
