import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Banknote, CheckCircle2, FileText, GitBranch, UserCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
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
    },
    {
      label: "Loan Products",
      value: metrics?.total_products ?? 0,
      icon: GitBranch,
      tone: "text-info",
      surface: "bg-info/10",
    },
    {
      label: "Applications",
      value: metrics?.total_applications ?? 0,
      icon: FileText,
      tone: "text-warning",
      surface: "bg-warning/15",
    },
    {
      label: "Under Review",
      value: metrics?.under_review_applications ?? 0,
      icon: Activity,
      tone: "text-warning",
      surface: "bg-warning/15",
    },
    {
      label: "Approved Outcomes",
      value: metrics?.approved_outcomes ?? 0,
      icon: CheckCircle2,
      tone: "text-success",
      surface: "bg-success/10",
    },
    {
      label: "Pending User Approvals",
      value: metrics?.pending_user_approvals ?? 0,
      icon: UserCheck,
      tone: "text-warning",
      surface: "bg-warning/15",
    },
  ], [
    metrics?.approved_outcomes,
    metrics?.pending_user_approvals,
    metrics?.total_applications,
    metrics?.total_banks,
    metrics?.total_products,
    metrics?.under_review_applications,
  ]);

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
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {cards.map((item) => (
          <Card key={item.label} className="border-border/70 bg-card shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg border border-border/70 ${item.surface}`}>
                  <item.icon className={`h-5 w-5 ${item.tone}`} />
                </div>
              </div>
              <p className="mt-2 text-2xl font-semibold text-foreground">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/70 bg-card shadow-sm">
        <CardHeader className="border-b border-border/50">
          <CardTitle>Recent Audit Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
          {(overviewQuery.data?.recent_activity.length ?? 0) === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No audit events available.</div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
