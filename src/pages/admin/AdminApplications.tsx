import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StatusBadge from "@/components/shared/StatusBadge";
import PageHeader from "@/components/shared/PageHeader";
import { apiFetch } from "@/lib/api/client";
import { formatLKR } from "@/lib/currency";
import type { AdminApplicationRow } from "@/types/admin";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-LK", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminApplications() {
  const [search, setSearch] = useState("");

  const applicationsQuery = useQuery({
    queryKey: ["admin-applications"],
    queryFn: () => apiFetch<AdminApplicationRow[]>("/api/admin/applications"),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const source = applicationsQuery.data ?? [];
    if (!term) {
      return source;
    }

    return source.filter((item) => {
      const applicantName = item.user_profile?.full_name ?? "";
      const applicantEmail = item.user_profile?.email ?? "";
      return (
        item.id.toLowerCase().includes(term) ||
        item.purpose.toLowerCase().includes(term) ||
        applicantName.toLowerCase().includes(term) ||
        applicantEmail.toLowerCase().includes(term)
      );
    });
  }, [applicationsQuery.data, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        subtitle="Review submitted applications."
      />

      <Card className="data-table-wrap">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Applications</CardTitle>
          <Input
            className="max-w-sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by applicant, email, purpose, or app ID"
          />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Application</TableHead>
                <TableHead>Applicant</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((application) => {
                return (
                  <TableRow key={application.id}>
                    <TableCell>
                      <p className="font-mono text-xs">{application.id.slice(0, 8)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{application.purpose}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{application.user_profile?.full_name ?? "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground">{application.user_profile?.email ?? "-"}</p>
                    </TableCell>
                    <TableCell>{formatLKR(application.requested_amount)}</TableCell>
                    <TableCell>
                      <StatusBadge status={application.outcome?.status ?? application.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(application.updated_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {(rows.length === 0 && !applicationsQuery.isLoading) ? (
            <div className="p-4 text-sm text-muted-foreground">No applications found.</div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
