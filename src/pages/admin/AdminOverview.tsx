import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Banknote, CheckCircle2, FileText, GitBranch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    },
    {
      label: "Loan Products",
      value: metrics?.total_products ?? 0,
      icon: GitBranch,
      tone: "text-info",
    },
    {
      label: "Applications",
      value: metrics?.total_applications ?? 0,
      icon: FileText,
      tone: "text-warning",
    },
    {
      label: "Under Review",
      value: metrics?.under_review_applications ?? 0,
      icon: Activity,
      tone: "text-warning",
    },
    {
      label: "Approved Outcomes",
      value: metrics?.approved_outcomes ?? 0,
      icon: CheckCircle2,
      tone: "text-success",
    },
  ], [metrics?.approved_outcomes, metrics?.total_applications, metrics?.total_banks, metrics?.total_products, metrics?.under_review_applications]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Overview"
        subtitle="Live operational metrics and latest sensitive actions across the platform."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((item) => (
          <Card key={item.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <item.icon className={`h-4 w-4 ${item.tone}`} />
              </div>
              <p className="mt-2 text-2xl font-semibold text-foreground">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="data-table-wrap">
        <CardHeader>
          <CardTitle>Recent Audit Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Entity ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(overviewQuery.data?.recent_activity ?? []).map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{formatDate(log.created_at)}</TableCell>
                  <TableCell>{log.actor_profile?.full_name || log.actor_profile?.email || "System"}</TableCell>
                  <TableCell className="font-medium">{log.action}</TableCell>
                  <TableCell>{log.entity_type}</TableCell>
                  <TableCell className="font-mono text-xs">{log.entity_id ?? "-"}</TableCell>
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
