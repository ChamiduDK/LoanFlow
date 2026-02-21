import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/shared/PageHeader";
import { apiFetch } from "@/lib/api/client";
import type { AdminAuditLog } from "@/types/admin";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-LK", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminAuditLogs() {
  const [search, setSearch] = useState("");

  const logsQuery = useQuery({
    queryKey: ["admin-audit-logs"],
    queryFn: () => apiFetch<AdminAuditLog[]>("/api/admin/audit-logs?limit=100"),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return logsQuery.data ?? [];

    return (logsQuery.data ?? []).filter((row) =>
      row.action.toLowerCase().includes(term) ||
      row.entity_type.toLowerCase().includes(term) ||
      String(row.actor_profile?.email ?? "").toLowerCase().includes(term) ||
      String(row.actor_profile?.full_name ?? "").toLowerCase().includes(term),
    );
  }, [logsQuery.data, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        subtitle="Review sensitive admin and user actions for compliance and traceability."
      />

      <Card className="data-table-wrap">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Event Log</CardTitle>
          <Input className="max-w-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search logs" />
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
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDate(row.created_at)}</TableCell>
                  <TableCell>{row.actor_profile?.full_name || row.actor_profile?.email || "System"}</TableCell>
                  <TableCell className="font-medium">{row.action}</TableCell>
                  <TableCell>{row.entity_type}</TableCell>
                  <TableCell className="font-mono text-xs">{row.entity_id ?? "-"}</TableCell>
                  <TableCell>{row.ip_address ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length === 0 ? <div className="p-4 text-sm text-muted-foreground">No audit events found.</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}
